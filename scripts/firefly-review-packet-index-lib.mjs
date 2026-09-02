import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  buildFireflyReviewPacketStaticIndex,
  mergeFireflyReviewPackets,
  validateFireflyReviewPacketStaticIndex,
} from "../app/firefly-review-packet-index.mjs";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

export async function importFireflyReviewPacketBatch({ sourcePaths, targetDir }) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new Error("At least one Firefly review packet v2 path is required.");
  }
  const values = await Promise.all(sourcePaths.map(async (sourcePath) => JSON.parse(await readFile(sourcePath, "utf8"))));
  const incomingPackets = buildFireflyReviewPacketStaticIndex(values).packets;
  const immutableDir = join(targetDir, "immutable");
  const indexPath = join(targetDir, "index.json");
  const existingIndexContent = await readIfPresent(indexPath);
  const existingPackets = existingIndexContent === null
    ? []
    : validateFireflyReviewPacketStaticIndex(JSON.parse(existingIndexContent)).packets;
  const index = buildFireflyReviewPacketStaticIndex(mergeFireflyReviewPackets(incomingPackets, existingPackets));
  const packetArtifacts = index.packets.map((packet) => ({
    packet,
    path: join(immutableDir, `${packet.packetId}.json`),
    content: `${JSON.stringify(packet, null, 2)}\n`,
  }));

  for (const artifact of packetArtifacts) {
    const existing = await readIfPresent(artifact.path);
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
  const indexContent = `${JSON.stringify(index, null, 2)}\n`;
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
