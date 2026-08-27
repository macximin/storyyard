import assert from "node:assert/strict";
import test from "node:test";
import { validateAppliedReceipt } from "../app/firefly-review-ack.ts";
import { hasAppliedFireflyDecision, partitionFireflyReviewPackets } from "../app/firefly-review-queue.ts";

const stored = {
  id: "9a63d4c0-b828-4c2e-a545-e6b3a4d583bd",
  packetId: "frp-53c23574a09caeef1122f213",
  packetSha256: "53c23574a09caeef1122f213ddee00f31f1891fd1897502895bb729acee06492",
  bookId: "처가에서-쫓겨난-날-재벌가가-나를-찾았다",
  artifactId: "chapter-0001",
  candidateId: "doksik-canary-a-20260826-v4",
  candidateSha256: "cada98e7eaf128eaacb56ab08bb3da47ce1e6558e913eefabb1a3d04e38e36c7",
  decision: "hold",
  comment: "실운영 왕복 카나리",
  status: "pending",
  createdAt: "2026-08-26T05:02:51.610Z",
  appliedAt: null,
  applyReceiptPath: null,
};
const receipt = {
  schemaVersion: "firefly_review_decision/v1",
  decisionId: stored.id,
  packetId: stored.packetId,
  packetSha256: stored.packetSha256,
  workId: stored.bookId,
  artifactId: stored.artifactId,
  candidateId: stored.candidateId,
  candidateSha256: stored.candidateSha256,
  decision: stored.decision,
  comment: stored.comment,
  status: "applied",
  createdAt: stored.createdAt,
  appliedAt: "2026-08-26T05:03:39.238Z",
  applyReceiptPath: `books/${stored.bookId}/story/review-decisions/${stored.id}.json`,
  result: { status: "held", candidateId: stored.candidateId },
};

test("accepts an exact InkOS applied receipt", () => {
  assert.equal(validateAppliedReceipt(stored, receipt).ok, true);
});

test("rejects a changed hash, path, timestamp, or missing result", () => {
  const withoutResult = { ...receipt };
  delete withoutResult.result;
  for (const changed of [
    { ...receipt, candidateSha256: "0".repeat(64) },
    { ...receipt, applyReceiptPath: "books/wrong.json" },
    { ...receipt, appliedAt: "2026-08-26T05:01:00.000Z" },
    withoutResult,
  ]) assert.equal(validateAppliedReceipt(stored, changed).ok, false);
});

test("removes a packet from the active queue after InkOS apply acknowledgement", () => {
  const packets = [{ packetId: "pending" }, { packetId: "terminal" }];
  const decisions = {
    pending: [{ status: "pending" }],
    terminal: [{ status: "pending" }, { status: "applied" }],
  };
  assert.equal(hasAppliedFireflyDecision(decisions.pending), false);
  assert.equal(hasAppliedFireflyDecision(decisions.terminal), true);
  const queue = partitionFireflyReviewPackets(packets, decisions);
  assert.deepEqual(queue.active.map((packet) => packet.packetId), ["pending"]);
  assert.deepEqual(queue.completed.map((packet) => packet.packetId), ["terminal"]);
});
