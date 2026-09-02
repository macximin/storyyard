import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  buildFireflyReviewPacketStaticIndex,
  mergeFireflyReviewPackets,
  validateFireflyReviewPacketStaticIndex,
} from "../app/firefly-review-packet-index.mjs";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const FIREFLY_REVIEW_V2_MAX_PACKET_RAW_BYTES = 64 * 1024 * 1024;
export const FIREFLY_REVIEW_V2_MAX_BATCH_FILES = 256;
export const FIREFLY_REVIEW_V2_MAX_BATCH_RAW_BYTES = 256 * 1024 * 1024;
export const FIREFLY_REVIEW_V2_MAX_STATIC_INDEX_BYTES = 256 * 1024 * 1024;

const importLimitKeys = new Set([
  "maxPacketRawBytes",
  "maxBatchFiles",
  "maxBatchRawBytes",
  "maxStaticIndexBytes",
]);

function resolveImportLimits(limits = {}) {
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) {
    throw new Error("Firefly review import limits must be an object.");
  }
  for (const key of Object.keys(limits)) {
    if (!importLimitKeys.has(key)) throw new Error(`Unknown Firefly review import limit: ${key}.`);
  }
  const resolveLimit = (key, hardLimit) => {
    const value = limits[key] ?? hardLimit;
    if (!Number.isSafeInteger(value) || value < 1 || value > hardLimit) {
      throw new Error(`${key} must be a positive safe integer no greater than ${hardLimit}.`);
    }
    return value;
  };
  return {
    maxPacketRawBytes: resolveLimit("maxPacketRawBytes", FIREFLY_REVIEW_V2_MAX_PACKET_RAW_BYTES),
    maxBatchFiles: resolveLimit("maxBatchFiles", FIREFLY_REVIEW_V2_MAX_BATCH_FILES),
    maxBatchRawBytes: resolveLimit("maxBatchRawBytes", FIREFLY_REVIEW_V2_MAX_BATCH_RAW_BYTES),
    maxStaticIndexBytes: resolveLimit("maxStaticIndexBytes", FIREFLY_REVIEW_V2_MAX_STATIC_INDEX_BYTES),
  };
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function openBoundedRegularFile(path, maxBytes, label) {
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | noFollow);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`${label} must be a regular file: ${path}.`);
    if (before.size > BigInt(maxBytes)) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit: ${path}.`);
    }
    return { before, handle, path, size: Number(before.size) };
  } catch (error) {
    await handle?.close();
    if (error?.code === "ELOOP") throw new Error(`${label} may not be a symbolic link: ${path}.`);
    throw error;
  }
}

async function readStableOpenedFile(source, label) {
  const content = Buffer.allocUnsafe(source.size);
  let offset = 0;
  while (offset < content.length) {
    const { bytesRead } = await source.handle.read(content, offset, content.length - offset, offset);
    if (bytesRead === 0) throw new Error(`${label} changed while it was being read: ${source.path}.`);
    offset += bytesRead;
  }
  const probe = Buffer.allocUnsafe(1);
  const { bytesRead: trailingBytes } = await source.handle.read(probe, 0, 1, source.size);
  const after = await source.handle.stat({ bigint: true });
  if (trailingBytes !== 0 || !sameFileSnapshot(source.before, after)) {
    throw new Error(`${label} changed while it was being read: ${source.path}.`);
  }
  return content.toString("utf8");
}

async function readOptionalStableBoundedFile(path, maxBytes, label) {
  let source;
  try {
    source = await openBoundedRegularFile(path, maxBytes, label);
    return await readStableOpenedFile(source, label);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  } finally {
    await source?.handle.close();
  }
}

async function readIncomingPacketFiles(sourcePaths, limits) {
  let aggregateBytes = 0;
  for (const sourcePath of sourcePaths) {
    let source;
    try {
      source = await openBoundedRegularFile(sourcePath, limits.maxPacketRawBytes, "Firefly review packet v2 input");
      aggregateBytes += source.size;
      if (aggregateBytes > limits.maxBatchRawBytes) {
        throw new Error(`Firefly review packet v2 inputs exceed the ${limits.maxBatchRawBytes}-byte aggregate limit.`);
      }
    } finally {
      await source?.handle.close();
    }
  }

  aggregateBytes = 0;
  const rawValues = [];
  for (const sourcePath of sourcePaths) {
    let source;
    try {
      source = await openBoundedRegularFile(sourcePath, limits.maxPacketRawBytes, "Firefly review packet v2 input");
      aggregateBytes += source.size;
      if (aggregateBytes > limits.maxBatchRawBytes) {
        throw new Error(`Firefly review packet v2 inputs exceed the ${limits.maxBatchRawBytes}-byte aggregate limit.`);
      }
      rawValues.push(await readStableOpenedFile(source, "Firefly review packet v2 input"));
    } finally {
      await source?.handle.close();
    }
  }
  return rawValues.map((raw) => JSON.parse(raw));
}

async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeImmutable(path, content) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(content, "utf8");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== content) {
      throw new Error(`A different packet already occupies immutable path ${path}.`);
    }
  } finally {
    await handle?.close();
  }
}

async function replaceAtomically(path, content) {
  if (await readIfPresent(path) === content) return;
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close();
    await unlink(temporary).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

export async function importFireflyReviewPacketBatch({ sourcePaths, targetDir, limits: requestedLimits }) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new Error("At least one Firefly review packet v2 path is required.");
  }
  const limits = resolveImportLimits(requestedLimits);
  if (sourcePaths.length > limits.maxBatchFiles) {
    throw new Error(`Firefly review packet v2 input count exceeds the ${limits.maxBatchFiles}-file limit.`);
  }
  const values = await readIncomingPacketFiles(sourcePaths, limits);
  const incomingPackets = buildFireflyReviewPacketStaticIndex(values).packets;
  const immutableDir = join(targetDir, "immutable");
  const indexPath = join(targetDir, "index.json");
  const existingIndexContent = await readOptionalStableBoundedFile(
    indexPath,
    limits.maxStaticIndexBytes,
    "Firefly review packet static index",
  );
  const existingPackets = existingIndexContent === null
    ? []
    : validateFireflyReviewPacketStaticIndex(JSON.parse(existingIndexContent)).packets;
  const index = buildFireflyReviewPacketStaticIndex(mergeFireflyReviewPackets(incomingPackets, existingPackets));
  const indexContent = `${JSON.stringify(index, null, 2)}\n`;
  const projectedIndexBytes = Buffer.byteLength(indexContent, "utf8");
  if (projectedIndexBytes > limits.maxStaticIndexBytes) {
    throw new Error(`Projected Firefly review packet static index exceeds the ${limits.maxStaticIndexBytes}-byte limit.`);
  }
  const packetArtifacts = index.packets.map((packet) => ({
    packet,
    path: join(immutableDir, `${packet.packetId}.json`),
    content: `${JSON.stringify(packet, null, 2)}\n`,
  }));

  for (const artifact of packetArtifacts) {
    const existing = await readOptionalStableBoundedFile(
      artifact.path,
      Buffer.byteLength(artifact.content, "utf8"),
      "Immutable Firefly review packet",
    );
    if (existing !== null && existing !== artifact.content) {
      throw new Error(`A different packet already occupies immutable path ${artifact.path}.`);
    }
  }

  await mkdir(immutableDir, { recursive: true, mode: 0o700 });
  for (const artifact of packetArtifacts) await writeImmutable(artifact.path, artifact.content);
  for (const artifact of packetArtifacts) {
    const stored = await readFile(artifact.path, "utf8");
    if (stored !== artifact.content) throw new Error(`Immutable packet readback mismatch at ${artifact.path}.`);
    const parsed = validateFireflyReviewPacket(JSON.parse(stored));
    if (parsed.packetId !== artifact.packet.packetId || parsed.packetSha256 !== artifact.packet.packetSha256) {
      throw new Error(`Immutable packet identity changed during readback at ${artifact.path}.`);
    }
  }
  await replaceAtomically(indexPath, indexContent);
  const storedIndexContent = await readFile(indexPath, "utf8");
  if (storedIndexContent !== indexContent) throw new Error(`Static review index readback mismatch at ${indexPath}.`);
  const storedIndex = validateFireflyReviewPacketStaticIndex(JSON.parse(storedIndexContent));
  if (storedIndex.indexSha256 !== index.indexSha256) throw new Error(`Static review index identity changed during readback at ${indexPath}.`);

  return {
    schemaVersion: index.schemaVersion,
    indexSha256: index.indexSha256,
    indexArtifactSha256: sha256(indexContent),
    indexPath,
    packetCount: index.packets.length,
    packets: packetArtifacts.map((artifact) => ({
      packetId: artifact.packet.packetId,
      packetSha256: artifact.packet.packetSha256,
      artifactSha256: sha256(artifact.content),
      path: artifact.path,
    })),
  };
}
