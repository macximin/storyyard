import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { importFireflyReviewPacketBatch } from "../scripts/firefly-review-packet-index-lib.mjs";
import { makeFireflyReviewPacketV2 } from "./firefly-review-v2-fixture.mjs";

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
    /accepts immutable Firefly review packet v2 values only/u,
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
  const index = validateFireflyReviewPacketStaticIndex(JSON.parse(await readFile(join(targetDir, "index.json"), "utf8")));
  assert.deepEqual(index.packets.map((packet) => packet.comparison.round), [1, 2]);
  for (const packet of index.packets) {
    const immutable = JSON.parse(await readFile(join(targetDir, "immutable", `${packet.packetId}.json`), "utf8"));
    assert.equal(immutable.packetSha256, packet.packetSha256);
  }

  const occupied = join(targetDir, "immutable", `${index.packets[0].packetId}.json`);
  await writeFile(occupied, "tampered\n", "utf8");
  await assert.rejects(
    importFireflyReviewPacketBatch({ sourcePaths, targetDir }),
    /different packet already occupies immutable path/u,
  );
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
  const v2 = makeFireflyReviewPacketV2({ genre: "무협", round: 2 });
  assert.equal(fireflyReviewQueueMetadata(v2), "무협 · blind pair · 2/3");
  const legacy = validateFireflyReviewPacket(JSON.parse(await readFile(
    new URL("../data/firefly/review-packets/current.json", import.meta.url),
    "utf8",
  )));
  assert.match(fireflyReviewQueueMetadata(legacy), /2개 후보/u);
});
