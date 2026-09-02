import { createHash } from "node:crypto";

export type StoredReviewDecision = {
  id: string;
  schemaVersion: string;
  packetId: string;
  packetSha256: string;
  bookId: string;
  artifactId: string;
  candidateId: string;
  candidateSha256: string;
  decision: string;
  comment: string;
  surfaceClassifications: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  applyReceiptPath: string | null;
};

export type ValidAppliedReceipt = {
  schemaVersion: "firefly_review_decision/v1";
  decisionId: string;
  packetId: string;
  packetSha256: string;
  workId: string;
  artifactId: string;
  candidateId: string;
  candidateSha256: string;
  decision: string;
  comment: string;
  surfaceClassifications?: unknown[];
  status: "applied";
  createdAt: string;
  appliedAt: string;
  applyReceiptPath: string;
  result: unknown;
};

export type ReceiptValidation =
  | { ok: true; receipt: ValidAppliedReceipt }
  | { ok: false; status: 400 | 409; error: string };

export type ValidEvaluationAck = {
  schemaVersion: "firefly_review_evaluation_ack/v1";
  decisionId: string;
  packetId: string;
  packetSha256: string;
  workId: string;
  artifactId: string;
  candidateId: string | null;
  candidateSha256: string | null;
  decision: "select" | "tie" | "invalid";
  comment: string;
  surfaceClassifications: unknown[];
  purpose: "promotion-evaluation";
  decisionEffect: "advisory";
  canonEffect: "none";
  manuscriptApply: false;
  status: "acknowledged";
  createdAt: string;
  acknowledgedAt: string;
  ackReceiptPath: string;
  receiptSelfHash: string;
};

export type EvaluationAckValidation =
  | { ok: true; receipt: ValidEvaluationAck }
  | { ok: false; status: 400 | 409; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function expectedReceiptPath(workId: string, decisionId: string): string {
  return `books/${workId}/story/review-decisions/${decisionId}.json`;
}

export function expectedEvaluationAckPath(pairId: string, decisionId: string): string {
  return `.inkos/canaries/${pairId}/review/decisions/${decisionId}.json`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function reviewReceiptSelfHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function validateAppliedReceipt(stored: StoredReviewDecision, value: unknown): ReceiptValidation {
  if (!isRecord(value)
    || value.schemaVersion !== "firefly_review_decision/v1"
    || value.status !== "applied"
    || !("result" in value)) {
    return { ok: false, status: 400, error: "InkOS 적용 영수증 형식이 올바르지 않음." };
  }
  if (!isIsoTimestamp(value.appliedAt) || !isIsoTimestamp(value.createdAt)) {
    return { ok: false, status: 400, error: "InkOS 적용 시각이 올바르지 않음." };
  }
  const exactIdentity = stored.packetId === value.packetId
    && stored.schemaVersion === value.schemaVersion
    && stored.packetSha256 === value.packetSha256
    && stored.bookId === value.workId
    && stored.artifactId === value.artifactId
    && stored.candidateId === value.candidateId
    && stored.candidateSha256 === value.candidateSha256
    && stored.decision === value.decision
    && stored.comment === value.comment
    && stored.createdAt === value.createdAt;
  const exactSurfaceClassifications = !("surfaceClassifications" in value);
  const exactPath = value.applyReceiptPath === expectedReceiptPath(stored.bookId, stored.id);
  if (!exactIdentity || !exactSurfaceClassifications || !exactPath) {
    return { ok: false, status: 409, error: "InkOS 영수증이 Storyyard 원판정과 정확히 일치하지 않음." };
  }
  if (Date.parse(value.appliedAt) < Date.parse(stored.createdAt)) {
    return { ok: false, status: 409, error: "InkOS 적용 시각이 판정 시각보다 빠름." };
  }
  return { ok: true, receipt: value as ValidAppliedReceipt };
}

export function validateEvaluationAck(
  stored: StoredReviewDecision,
  value: unknown,
  pairId: string,
): EvaluationAckValidation {
  const requiredKeys = [
    "schemaVersion", "decisionId", "packetId", "packetSha256", "workId", "artifactId",
    "candidateId", "candidateSha256", "decision", "comment", "surfaceClassifications",
    "purpose", "decisionEffect", "canonEffect", "manuscriptApply", "status", "createdAt",
    "acknowledgedAt", "ackReceiptPath", "receiptSelfHash",
  ].sort();
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(requiredKeys)
    || value.schemaVersion !== "firefly_review_evaluation_ack/v1"
    || value.purpose !== "promotion-evaluation"
    || value.decisionEffect !== "advisory"
    || value.canonEffect !== "none"
    || value.manuscriptApply !== false
    || value.status !== "acknowledged"
    || !Array.isArray(value.surfaceClassifications)) {
    return { ok: false, status: 400, error: "평가 확인 영수증 형식이 올바르지 않음." };
  }
  if (stored.schemaVersion !== "firefly_review_decision/v2"
    || !["select", "tie", "invalid"].includes(String(value.decision))) {
    return { ok: false, status: 409, error: "평가 확인 영수증이 v2 사람 판정과 맞지 않음." };
  }
  if (!isIsoTimestamp(value.acknowledgedAt) || !isIsoTimestamp(value.createdAt)) {
    return { ok: false, status: 400, error: "평가 확인 시각이 올바르지 않음." };
  }
  const expectedCandidateId = stored.candidateId || null;
  const expectedCandidateSha256 = stored.candidateSha256 || null;
  const exactIdentity = stored.id === value.decisionId
    && stored.packetId === value.packetId
    && stored.packetSha256 === value.packetSha256
    && stored.bookId === value.workId
    && stored.artifactId === value.artifactId
    && expectedCandidateId === value.candidateId
    && expectedCandidateSha256 === value.candidateSha256
    && stored.decision === value.decision
    && stored.comment === value.comment
    && stored.createdAt === value.createdAt;
  let exactSurfaceClassifications = false;
  try {
    const storedClassifications = JSON.parse(stored.surfaceClassifications);
    exactSurfaceClassifications = Array.isArray(storedClassifications)
      && JSON.stringify(storedClassifications) === JSON.stringify(value.surfaceClassifications);
  } catch {
    exactSurfaceClassifications = false;
  }
  const exactPath = value.ackReceiptPath === expectedEvaluationAckPath(pairId, stored.id);
  const { receiptSelfHash, ...unsigned } = value;
  const exactSelfHash = typeof receiptSelfHash === "string"
    && /^[0-9a-f]{64}$/u.test(receiptSelfHash)
    && reviewReceiptSelfHash(unsigned) === receiptSelfHash;
  if (!exactIdentity || !exactSurfaceClassifications || !exactPath || !exactSelfHash) {
    return { ok: false, status: 409, error: "평가 확인 영수증이 Storyyard 원판정과 정확히 일치하지 않음." };
  }
  if (Date.parse(value.acknowledgedAt) < Date.parse(stored.createdAt)) {
    return { ok: false, status: 409, error: "평가 확인 시각이 판정 시각보다 빠름." };
  }
  return { ok: true, receipt: value as ValidEvaluationAck };
}
