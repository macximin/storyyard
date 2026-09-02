import assert from "node:assert/strict";
import test from "node:test";
import {
  expectedEvaluationAckPath,
  reviewReceiptSelfHash,
  validateAppliedReceipt,
  validateEvaluationAck,
} from "../app/firefly-review-ack.ts";
import {
  hasAcknowledgedFireflyEvaluation,
  hasAppliedFireflyDecision,
  partitionFireflyReviewPackets,
} from "../app/firefly-review-queue.ts";

const stored = {
  id: "9a63d4c0-b828-4c2e-a545-e6b3a4d583bd",
  schemaVersion: "firefly_review_decision/v1",
  packetId: "frp-53c23574a09caeef1122f213",
  packetSha256: "53c23574a09caeef1122f213ddee00f31f1891fd1897502895bb729acee06492",
  bookId: "처가에서-쫓겨난-날-재벌가가-나를-찾았다",
  artifactId: "chapter-0001",
  candidateId: "doksik-canary-a-20260826-v4",
  candidateSha256: "cada98e7eaf128eaacb56ab08bb3da47ce1e6558e913eefabb1a3d04e38e36c7",
  decision: "hold",
  comment: "실운영 왕복 카나리",
  surfaceClassifications: "[]",
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

test("binds a v2 evaluation acknowledgement without manuscript application", () => {
  const classifications = [{
    matchId: "fsm-1234567890abcdef12345678",
    selectorSha256: "1".repeat(64),
    classification: "source-surface",
    classifiedByActorId: "owner-one",
    classifiedByRole: "admin",
    ownerScope: "owner-scope",
    classifiedAt: stored.createdAt,
  }];
  const v2Stored = {
    ...stored,
    schemaVersion: "firefly_review_decision/v2",
    decision: "select",
    surfaceClassifications: JSON.stringify(classifications),
  };
  const pairId = "pair-one";
  const unsigned = {
    schemaVersion: "firefly_review_evaluation_ack/v1",
    decisionId: v2Stored.id,
    packetId: v2Stored.packetId,
    packetSha256: v2Stored.packetSha256,
    workId: v2Stored.bookId,
    artifactId: v2Stored.artifactId,
    candidateId: v2Stored.candidateId,
    candidateSha256: v2Stored.candidateSha256,
    decision: v2Stored.decision,
    comment: v2Stored.comment,
    surfaceClassifications: classifications,
    purpose: "promotion-evaluation",
    decisionEffect: "advisory",
    canonEffect: "none",
    manuscriptApply: false,
    status: "acknowledged",
    createdAt: v2Stored.createdAt,
    acknowledgedAt: "2026-08-26T05:03:39.238Z",
    ackReceiptPath: expectedEvaluationAckPath(pairId, v2Stored.id),
  };
  const ack = { ...unsigned, receiptSelfHash: reviewReceiptSelfHash(unsigned) };
  assert.equal(validateEvaluationAck(v2Stored, ack, pairId).ok, true);
  assert.equal(validateAppliedReceipt(v2Stored, { ...receipt, schemaVersion: "firefly_review_decision/v2" }).ok, false);

  const changedClassifications = {
    ...unsigned,
    surfaceClassifications: [{ ...classifications[0], classification: "engine" }],
  };
  assert.equal(validateEvaluationAck(v2Stored, {
    ...changedClassifications,
    receiptSelfHash: reviewReceiptSelfHash(changedClassifications),
  }, pairId).ok, false);

  for (const unsafe of [
    { ...unsigned, manuscriptApply: true },
    { ...unsigned, canonEffect: "chapter-applied" },
    { ...unsigned, status: "applied" },
  ]) {
    assert.equal(validateEvaluationAck(v2Stored, {
      ...unsafe,
      receiptSelfHash: reviewReceiptSelfHash(unsafe),
    }, pairId).ok, false);
  }
});

test("uses applied for v1 and acknowledged for v2 queue completion", () => {
  const packets = [
    { packetId: "v1-pending", schemaVersion: "firefly_review_packet/v1" },
    { packetId: "v1-terminal", schemaVersion: "firefly_review_packet/v1" },
    { packetId: "v2-pending", schemaVersion: "firefly_review_packet/v2" },
    { packetId: "v2-terminal", schemaVersion: "firefly_review_packet/v2" },
  ];
  const decisions = {
    "v1-pending": [{ status: "pending" }],
    "v1-terminal": [{ status: "pending" }, { status: "applied" }],
    "v2-pending": [{ status: "pending" }, { status: "applied" }],
    "v2-terminal": [{ status: "pending" }, { status: "acknowledged" }],
  };
  assert.equal(hasAppliedFireflyDecision(decisions["v1-pending"]), false);
  assert.equal(hasAppliedFireflyDecision(decisions["v1-terminal"]), true);
  assert.equal(hasAcknowledgedFireflyEvaluation(decisions["v2-pending"]), false);
  assert.equal(hasAcknowledgedFireflyEvaluation(decisions["v2-terminal"]), true);
  const queue = partitionFireflyReviewPackets(packets, decisions);
  assert.deepEqual(queue.active.map((packet) => packet.packetId), ["v1-pending", "v2-pending"]);
  assert.deepEqual(queue.completed.map((packet) => packet.packetId), ["v1-terminal", "v2-terminal"]);
});
