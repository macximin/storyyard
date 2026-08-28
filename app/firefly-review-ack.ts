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
  schemaVersion: "firefly_review_decision/v1" | "firefly_review_decision/v2";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function expectedReceiptPath(workId: string, decisionId: string): string {
  return `books/${workId}/story/review-decisions/${decisionId}.json`;
}

export function validateAppliedReceipt(stored: StoredReviewDecision, value: unknown): ReceiptValidation {
  if (!isRecord(value)
    || (value.schemaVersion !== "firefly_review_decision/v1" && value.schemaVersion !== "firefly_review_decision/v2")
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
  let exactSurfaceClassifications = false;
  if (stored.schemaVersion === "firefly_review_decision/v1") {
    exactSurfaceClassifications = !("surfaceClassifications" in value);
  } else {
    try {
      const storedClassifications = JSON.parse(stored.surfaceClassifications);
      exactSurfaceClassifications = Array.isArray(storedClassifications)
        && Array.isArray(value.surfaceClassifications)
        && JSON.stringify(storedClassifications) === JSON.stringify(value.surfaceClassifications);
    } catch {
      exactSurfaceClassifications = false;
    }
  }
  const exactPath = value.applyReceiptPath === expectedReceiptPath(stored.bookId, stored.id);
  if (!exactIdentity || !exactSurfaceClassifications || !exactPath) {
    return { ok: false, status: 409, error: "InkOS 영수증이 Storyyard 원판정과 정확히 일치하지 않음." };
  }
  if (Date.parse(value.appliedAt) < Date.parse(stored.createdAt)) {
    return { ok: false, status: 409, error: "InkOS 적용 시각이 판정 시각보다 빠름." };
  }
  return { ok: true, receipt: value as ValidAppliedReceipt };
}
