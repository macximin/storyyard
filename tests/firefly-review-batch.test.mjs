import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { fireflyReviewQueueMetadata } from "../app/firefly-review-display.mjs";
import {
  buildFireflyReviewPacketStaticIndex,
  mergeFireflyReviewPackets,
  validateFireflyReviewPacketStaticIndex,
} from "../app/firefly-review-packet-index.mjs";
import { hasDistinctBearerAuthority } from "../app/firefly-review-service-auth.ts";
import {
  FIREFLY_REVIEW_V2_MAX_BATCH_FILES,
  FIREFLY_REVIEW_V2_MAX_BATCH_RAW_BYTES,
  FIREFLY_REVIEW_V2_MAX_PACKET_RAW_BYTES,
  importFireflyReviewPacketBatch,
} from "../scripts/firefly-review-packet-index-lib.mjs";
import { makeFireflyReviewPacketV2 } from "./firefly-review-v2-fixture.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

async function writePacketSource(root, name, packet) {
  const path = join(root, `${name}.json`);
  await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  return path;
}

async function snapshotReviewTarget(targetDir) {
  const indexRaw = await readFile(join(targetDir, "index.json"), "utf8");
  const index = validateFireflyReviewPacketStaticIndex(JSON.parse(indexRaw));
  const immutable = Object.fromEntries(await Promise.all(index.packets.map(async (packet) => [
    packet.packetId,
    await readFile(join(targetDir, "immutable", `${packet.packetId}.json`), "utf8"),
  ])));
  return { immutable, indexRaw };
}

async function assertReviewTargetUnchanged(targetDir, expected) {
  assert.deepEqual(await snapshotReviewTarget(targetDir), expected);
}

async function seedReviewTarget(root, targetDir) {
  const sourcePath = await writePacketSource(root, "seed", makeFireflyReviewPacketV2({ round: 1 }));
  await importFireflyReviewPacketBatch({ sourcePaths: [sourcePath], targetDir });
  return { sourcePath, snapshot: await snapshotReviewTarget(targetDir) };
}

test("builds a strict, canonical multi-packet v2 static index", () => {
  const second = makeFireflyReviewPacketV2({ round: 2 });
  const first = makeFireflyReviewPacketV2({ round: 1 });
  const index = buildFireflyReviewPacketStaticIndex([second, first]);
  assert.deepEqual(index.packets.map((packet) => packet.comparison.round), [1, 2]);
  assert.deepEqual(validateFireflyReviewPacketStaticIndex(index), index);

  assert.throws(
    () => validateFireflyReviewPacketStaticIndex({ ...index, extra: true }),
    /missing or unknown fields/u,
  );
  assert.throws(
    () => validateFireflyReviewPacketStaticIndex({ ...index, indexSha256: "0".repeat(64) }),
    /SHA-256 mismatch/u,
  );
  assert.throws(
    () => buildFireflyReviewPacketStaticIndex([first, first]),
    /Duplicate Firefly review packet ID/u,
  );
});

test("refuses legacy v1 packets inside the generated v2 index", async () => {
  const legacy = JSON.parse(await readFile(
    new URL("../data/firefly/review-packets/current.json", import.meta.url),
    "utf8",
  ));
  assert.throws(
    () => buildFireflyReviewPacketStaticIndex([legacy]),
    /accepts immutable Firefly review packet v2, v3, or v4 values only/u,
  );
});

test("keeps the legacy current packet while loading indexed v2 packets", async () => {
  const legacy = validateFireflyReviewPacket(JSON.parse(await readFile(
    new URL("../data/firefly/review-packets/current.json", import.meta.url),
    "utf8",
  )));
  const indexed = makeFireflyReviewPacketV2();
  assert.deepEqual(
    mergeFireflyReviewPackets([indexed], [legacy]).map((packet) => packet.schemaVersion),
    ["firefly_review_packet/v2", "firefly_review_packet/v1"],
  );
  assert.equal(mergeFireflyReviewPackets([indexed], [indexed]).length, 1);
  assert.throws(
    () => mergeFireflyReviewPackets([indexed], [{ ...indexed, packetSha256: "0".repeat(64) }]),
    /Conflicting Firefly review packet ID/u,
  );
});

test("imports several packets to immutable files and one generated index", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyyard-review-batch-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "target");
  const packets = [
    makeFireflyReviewPacketV2({ round: 2 }),
    makeFireflyReviewPacketV2({ round: 1 }),
  ];
  const sourcePaths = await Promise.all(packets.map(async (packet, index) => {
    const path = join(root, `source-${index}.json`);
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
    return path;
  }));

  const first = await importFireflyReviewPacketBatch({ sourcePaths, targetDir });
  const second = await importFireflyReviewPacketBatch({ sourcePaths, targetDir });
  assert.equal(first.packetCount, 2);
  assert.equal(second.indexSha256, first.indexSha256);
  const indexRaw = await readFile(join(targetDir, "index.json"), "utf8");
  const index = validateFireflyReviewPacketStaticIndex(JSON.parse(indexRaw));
  assert.equal(first.indexArtifactSha256, hash(indexRaw));
  assert.deepEqual(index.packets.map((packet) => packet.comparison.round), [1, 2]);
  for (const packet of index.packets) {
    const immutableRaw = await readFile(join(targetDir, "immutable", `${packet.packetId}.json`), "utf8");
    const immutable = JSON.parse(immutableRaw);
    assert.equal(immutable.packetSha256, packet.packetSha256);
    assert.equal(first.packets.find((item) => item.packetId === packet.packetId).artifactSha256, hash(immutableRaw));
  }

  const occupied = join(targetDir, "immutable", `${index.packets[0].packetId}.json`);
  await writeFile(occupied, "tampered\n", "utf8");
  await assert.rejects(
    importFireflyReviewPacketBatch({ sourcePaths, targetDir }),
    /different packet already occupies immutable path/u,
  );
});

test("adds a later batch without dropping an immutable indexed packet", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyyard-review-additive-batch-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "target");
  const packets = [
    makeFireflyReviewPacketV2({ round: 1 }),
    makeFireflyReviewPacketV2({ round: 2 }),
  ];
  const sourcePaths = await Promise.all(packets.map(async (packet, index) => {
    const path = join(root, `source-${index}.json`);
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
    return path;
  }));

  await importFireflyReviewPacketBatch({ sourcePaths: [sourcePaths[0]], targetDir });
  const receipt = await importFireflyReviewPacketBatch({ sourcePaths: [sourcePaths[1]], targetDir });
  const stored = validateFireflyReviewPacketStaticIndex(JSON.parse(await readFile(join(targetDir, "index.json"), "utf8")));
  assert.equal(receipt.packetCount, 2);
  assert.deepEqual(stored.packets.map((packet) => packet.comparison.round), [1, 2]);
});

test("rejects a public v2 source larger than 64 MiB before changing stored review bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyyard-review-packet-cap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "target");
  const { snapshot } = await seedReviewTarget(root, targetDir);
  const oversized = join(root, "oversized.json");
  await writeFile(oversized, "{}", "utf8");
  await truncate(oversized, FIREFLY_REVIEW_V2_MAX_PACKET_RAW_BYTES + 1);

  await assert.rejects(
    importFireflyReviewPacketBatch({ sourcePaths: [oversized], targetDir }),
    /packet v2 input exceeds the 67108864-byte limit/u,
  );
  await assertReviewTargetUnchanged(targetDir, snapshot);
});

test("rejects too many public v2 inputs before changing stored review bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyyard-review-count-cap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "target");
  const { snapshot, sourcePath } = await seedReviewTarget(root, targetDir);

  await assert.rejects(
    importFireflyReviewPacketBatch({
      sourcePaths: Array(FIREFLY_REVIEW_V2_MAX_BATCH_FILES + 1).fill(sourcePath),
      targetDir,
    }),
    /input count exceeds the 256-file limit/u,
  );
  await assertReviewTargetUnchanged(targetDir, snapshot);
});

test("rejects an oversized aggregate from sparse public v2 inputs before parsing or writing", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyyard-review-aggregate-cap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "target");
  const { snapshot } = await seedReviewTarget(root, targetDir);
  const sourceCount = Math.floor(FIREFLY_REVIEW_V2_MAX_BATCH_RAW_BYTES / FIREFLY_REVIEW_V2_MAX_PACKET_RAW_BYTES) + 1;
  const sourcePaths = [];
  for (let index = 0; index < sourceCount; index += 1) {
    const path = join(root, `sparse-${index}.json`);
    await writeFile(path, "{}", "utf8");
    await truncate(path, FIREFLY_REVIEW_V2_MAX_PACKET_RAW_BYTES);
    sourcePaths.push(path);
  }

  await assert.rejects(
    importFireflyReviewPacketBatch({ sourcePaths, targetDir }),
    /inputs exceed the 268435456-byte aggregate limit/u,
  );
  await assertReviewTargetUnchanged(targetDir, snapshot);
});

test("rejects an oversized projected static index before changing stored review bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyyard-review-index-cap-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "target");
  const { snapshot } = await seedReviewTarget(root, targetDir);
  const secondSource = await writePacketSource(root, "second", makeFireflyReviewPacketV2({ round: 2 }));

  await assert.rejects(
    importFireflyReviewPacketBatch({
      sourcePaths: [secondSource],
      targetDir,
      limits: { maxStaticIndexBytes: Buffer.byteLength(snapshot.indexRaw, "utf8") },
    }),
    /Projected Firefly review packet static index exceeds/u,
  );
  await assertReviewTargetUnchanged(targetDir, snapshot);
});

test("separates review-sync read authority from apply authority", () => {
  const syncToken = "sync-token-123";
  const applyToken = "apply-token-456";
  const syncRequest = new Request("https://storyyard.test/api/firefly/review-decisions?packet_id=frp-test", {
    headers: { authorization: `Bearer ${syncToken}` },
  });
  const applyRequest = new Request("https://storyyard.test/api/firefly/review-decisions", {
    headers: { authorization: `Bearer ${applyToken}` },
  });
  assert.equal(hasDistinctBearerAuthority(syncRequest, syncToken, applyToken), true);
  assert.equal(hasDistinctBearerAuthority(syncRequest, applyToken, syncToken), false);
  assert.equal(hasDistinctBearerAuthority(applyRequest, applyToken, syncToken), true);
  assert.equal(hasDistinctBearerAuthority(syncRequest, syncToken, syncToken), false);
});

test("shows genre and round progress for v2 without breaking legacy metadata", async () => {
  const v2 = makeFireflyReviewPacketV2({ genre: "murim-ko", round: 2 });
  assert.equal(fireflyReviewQueueMetadata(v2), "무협 · blind 평가 · 2/3");
  const legacy = validateFireflyReviewPacket(JSON.parse(await readFile(
    new URL("../data/firefly/review-packets/current.json", import.meta.url),
    "utf8",
  )));
  assert.match(fireflyReviewQueueMetadata(legacy), /2개 후보/u);
});
