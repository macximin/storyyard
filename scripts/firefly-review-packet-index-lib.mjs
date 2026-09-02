import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { buildFireflyReviewPacketStaticIndex } from "../app/firefly-review-packet-index.mjs";

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
  const index = buildFireflyReviewPacketStaticIndex(values);
  const immutableDir = join(targetDir, "immutable");
  const indexPath = join(targetDir, "index.json");
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
  await replaceAtomically(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  return {
    schemaVersion: index.schemaVersion,
    indexSha256: index.indexSha256,
    indexPath,
    packetCount: index.packets.length,
    packets: packetArtifacts.map((artifact) => ({
      packetId: artifact.packet.packetId,
      packetSha256: artifact.packet.packetSha256,
      path: artifact.path,
    })),
  };
}
