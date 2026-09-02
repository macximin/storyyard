import { createHash } from "node:crypto";

export type FireflyManuscriptDecision = "approve" | "polish" | "hold" | "reject";
export type FireflyEvaluationDecision = "select" | "tie" | "invalid";
export type FireflyDecision = FireflyManuscriptDecision | FireflyEvaluationDecision;
export type SurfaceClassification = "engine" | "genre-convention" | "source-surface" | "canon-leak";
export type CandidateSpan = {
  coordinateKind: "utf8-byte";
  startByte: number;
  endByte: number;
  sliceSha256: string;
};
export type FireflySurfaceMatch = {
  matchId: string;
  selectorSha256: string;
  provenanceBridgeReceiptSha256: string;
  matchMethod: "exact-token-12" | "exact-byte-120" | "long-common-substring" | "near-string";
  classification: "pending";
  candidate: CandidateSpan & { candidateContentSha256: string };
  source: {
    coordinateKind: "utf8-byte";
    sourceId: string;
    sourceSha256: string;
    startByte: number;
    endByte: number;
    sliceSha256: string;
  };
};
export type FireflySurfaceClassificationReceipt = {
  matchId: string;
  selectorSha256: string;
  classification: SurfaceClassification;
  classifiedByActorId: string;
  classifiedByRole: "admin";
  ownerScope: string;
  classifiedAt: string;
};

type CommercialEvaluation = {
  openingPressure: number;
  protagonistAgency: number;
  resistanceQuality: number;
  visiblePayoff: number;
  endingPropulsion: number;
  referenceEngineRetention: number;
  transformationIntegrity: number;
  styleFidelity: number;
};

type BaseCandidate = {
  id: string;
  status: string;
  body: string;
  sha256: string;
  preparedAt: string;
  commercialScore: number | null;
};

export type FireflyReviewCandidateV1 = BaseCandidate & {
  commercialEvaluation?: Record<string, number> | null;
  review: {
    status: string;
    retained: string[];
    variedSurface: string[];
    linkedConsequences: string[];
    exactSurfaceMatches?: Array<{ tokenCount: number; text: string }>;
  };
};

export type FireflyReviewCandidateV2 = BaseCandidate & {
  kind: "blind-pair-candidate";
  evaluationBindingSha256: string;
  canaryIsolation: {
    receiptSha256: string;
    receiptSelfHash: string;
    isolationScopeSha256: string;
    commonSnapshotSha256: string;
  };
  commercialEvaluation: CommercialEvaluation;
  commercialEvaluationReceiptSha256: string;
  review: {
    status: string;
    retained: string[];
    variedSurface: string[];
    linkedConsequences: string[];
    emotionalCoherence: { score: number; evidence: CandidateSpan[] };
    contentNeutrality: {
      passed: boolean;
      violations: Array<{
        code: "unauthorized-softening" | "unauthorized-escalation" | "moral-lecture" | "disclaimer" | "forced-punishment" | "forced-apology" | "forced-redemption" | "forced-cost" | "forced-moral-growth" | "forced-balance";
        evidence: CandidateSpan[];
      }>;
    };
    canonContradictions: Array<{ code: "hard-canon-contradiction"; evidence: CandidateSpan[] }>;
    surfaceComparison: {
      schemaVersion: "soul_corpus_comparison/v2";
      soulId: string;
      soulVersion: string;
      surfaceIndexSha256: string;
      surfaceMatches: FireflySurfaceMatch[];
      similarityPenaltyApplied: false;
      automaticRewriteApplied: false;
      automaticRejectApplied: false;
      humanDecision: "pending";
    };
  };
};

type PacketBase = {
  packetId: string;
  packetSha256: string;
  generatedAt: string;
  source: { system: "inkos"; bookId: string; sourceRevision: string };
  work: { id: string; title: string; genre: string; status: string; targetChapters: number };
  artifact: { id: string; kind?: "chapter"; chapterNumber: number; title: string; status: string; currentContent: string; currentContentSha256: string };
};

export type FireflyReviewPacketV1 = PacketBase & {
  schemaVersion: "firefly_review_packet/v1";
  candidates: FireflyReviewCandidateV1[];
  recommendation: { candidateId: string; reason: string } | null;
  actions: ["approve", "polish", "hold", "reject"];
  authority: { canon: "inkos"; decisionSurface: "storyyard"; apply: "inkos"; reverseSync: false };
};

export type FireflyReviewPacketV2 = PacketBase & {
  schemaVersion: "firefly_review_packet/v2";
  purpose: "promotion-evaluation";
  comparison: {
    reviewKind: "independent-blind-comparison";
    pairId: string;
    round: 1 | 2 | 3;
    blindRunId: string;
    blindSessionId: string;
    commonInputReceiptSha256: string;
    pairedGenerationReceiptSha256: string;
    labelAssignmentReceiptSha256: string;
    runtimeReceiptSha256: string;
    canaryIsolation: {
      receiptSha256: string;
      receiptSelfHash: string;
      isolationScopeSha256: string;
      commonSnapshotSha256: string;
    };
    candidateLabelsShuffled: true;
    generatorMetadataExcluded: true;
    runtime: {
      kernel: "enforce";
      piWorker: "off";
      retrieval: "legacy";
      fts: "off";
      model: "gpt-5.6-sol";
      reasoning: "high";
    };
  };
  candidates: [FireflyReviewCandidateV2, FireflyReviewCandidateV2];
  sealedGenerationEvidence: {
    candidateEvidenceReceiptSha256s: [string, string];
    contentNeutralReceiptSha256s: [string, string];
  };
  recommendation: null;
  actions: ["select", "tie", "invalid"];
  authority: {
    canon: "inkos";
    decisionSurface: "storyyard";
    decisionEffect: "advisory";
    manuscriptApply: false;
    reverseSync: false;
  };
};

export type FireflyReviewPacket = FireflyReviewPacketV1 | FireflyReviewPacketV2;

const SHA = /^[0-9a-f]{64}$/u;
const PACKET_ID = /^frp-[0-9a-f]{24}$/u;
const OPAQUE_PAIR_ID = /^bp-[0-9a-f]{24}$/u;
const OPAQUE_BLIND_ID = /^br-[0-9a-f]{24}$/u;
const UTC_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const BLIND_IDS = ["candidate-A", "candidate-B"] as const;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const GENRE_SOUL_IDS: Readonly<Record<string, string>> = Object.freeze({
  "modern-fantasy-ko": "male-modern-fantasy-ko",
  "fantasy-ko": "male-fantasy-ko",
  "murim-ko": "male-murim-ko",
});
const CONTENT_NEUTRAL_CODES = new Set([
  "unauthorized-softening", "unauthorized-escalation", "moral-lecture", "disclaimer",
  "forced-punishment", "forced-apology", "forced-redemption", "forced-cost",
  "forced-moral-growth", "forced-balance",
]);
const MATCH_METHODS = new Set(["exact-token-12", "exact-byte-120", "long-common-substring", "near-string"]);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sort(child)]));
    }
    return item;
  };
  return sha256(JSON.stringify(sort(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) throw new Error(`Review contract is missing ${key}.`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Review contract has unknown field ${key}.`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireSafeId(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (!SAFE_ID.test(result)) throw new Error(`${label} must be a safe identifier.`);
  return result;
}

function requireSha(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (!SHA.test(result)) throw new Error(`${label} must be a full SHA-256.`);
  return result;
}

function requireIso(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (!UTC_DATETIME.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(`${label} must be a UTC-Z ISO timestamp.`);
  return result;
}

function requireNumber(value: unknown, label: string, minimum = 0, maximum = 100): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new Error(`${label} must be an integer >= ${minimum}.`);
  return value as number;
}

function requireStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be a string array.`);
  return value as string[];
}

type CanaryIsolationProjection = {
  receiptSha256: string;
  receiptSelfHash: string;
  isolationScopeSha256: string;
  commonSnapshotSha256: string;
};

function validateCanaryIsolation(value: unknown, label: string): CanaryIsolationProjection {
  const isolation = requireRecord(value, label);
  exactKeys(isolation, ["receiptSha256", "receiptSelfHash", "isolationScopeSha256", "commonSnapshotSha256"]);
  return {
    receiptSha256: requireSha(isolation.receiptSha256, `${label}.receiptSha256`),
    receiptSelfHash: requireSha(isolation.receiptSelfHash, `${label}.receiptSelfHash`),
    isolationScopeSha256: requireSha(isolation.isolationScopeSha256, `${label}.isolationScopeSha256`),
    commonSnapshotSha256: requireSha(isolation.commonSnapshotSha256, `${label}.commonSnapshotSha256`),
  };
}

function utf8Slice(body: string, startByte: number, endByte: number, label: string): Uint8Array {
  const bytes = new TextEncoder().encode(body);
  if (startByte < 0 || endByte <= startByte || endByte > bytes.byteLength) throw new Error(`${label} byte range is invalid.`);
  const slice = bytes.slice(startByte, endByte);
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(slice);
  if (sha256(new TextEncoder().encode(decoded)) !== sha256(slice)) throw new Error(`${label} does not align to UTF-8 boundaries.`);
  return slice;
}

function validateCandidateSpan(value: unknown, body: string, label: string, candidateSha?: string): CandidateSpan {
  const span = requireRecord(value, label);
  const required = candidateSha
    ? ["coordinateKind", "candidateContentSha256", "startByte", "endByte", "candidateSliceSha256"]
    : ["coordinateKind", "startByte", "endByte", "sliceSha256"];
  exactKeys(span, required);
  if (span.coordinateKind !== "utf8-byte") throw new Error(`${label} coordinate kind is invalid.`);
  if (candidateSha && span.candidateContentSha256 !== candidateSha) throw new Error(`${label} candidate SHA drifted.`);
  const start = requireInteger(span.startByte, `${label}.startByte`);
  const end = requireInteger(span.endByte, `${label}.endByte`, 1);
  const expected = requireSha(candidateSha ? span.candidateSliceSha256 : span.sliceSha256, `${label}.sliceSha256`);
  if (sha256(utf8Slice(body, start, end, label)) !== expected) throw new Error(`${label} slice SHA mismatch.`);
  return (candidateSha
    ? { coordinateKind: "utf8-byte", startByte: start, endByte: end, sliceSha256: expected }
    : span) as CandidateSpan;
}

function validateCommercialEvaluation(value: unknown, label: string): Record<string, number> {
  const evaluation = requireRecord(value, label);
  const keys = ["openingPressure", "protagonistAgency", "resistanceQuality", "visiblePayoff", "endingPropulsion", "referenceEngineRetention", "transformationIntegrity", "styleFidelity"];
  exactKeys(evaluation, keys);
  for (const key of keys) requireNumber(evaluation[key], `${label}.${key}`);
  return evaluation as Record<string, number>;
}

function validateSurfaceMatch(value: unknown, candidateBody: string, candidateSha: string, seen: Set<string>): void {
  const match = requireRecord(value, "surface match");
  exactKeys(match, ["matchId", "selectorSha256", "provenanceBridgeReceiptSha256", "matchMethod", "classification", "candidate", "source"]);
  const matchId = requireString(match.matchId, "surface match ID");
  if (seen.has(matchId)) throw new Error("Surface match IDs must be unique in a packet.");
  seen.add(matchId);
  const selectorSha = requireSha(match.selectorSha256, "surface selector SHA");
  requireSha(match.provenanceBridgeReceiptSha256, "surface provenance bridge SHA");
  if (!MATCH_METHODS.has(String(match.matchMethod))) throw new Error("Surface match method is invalid.");
  if (match.classification !== "pending") throw new Error("Tracked surface match classification must stay pending.");
  validateCandidateSpan(match.candidate, candidateBody, "surface candidate selector", candidateSha);
  const source = requireRecord(match.source, "surface source selector");
  exactKeys(source, ["coordinateKind", "sourceId", "sourceSha256", "startByte", "endByte", "sliceSha256"]);
  if (source.coordinateKind !== "utf8-byte") throw new Error("Surface source coordinates must be utf8-byte.");
  requireString(source.sourceId, "surface source ID");
  requireSha(source.sourceSha256, "surface source SHA");
  const start = requireInteger(source.startByte, "surface source start");
  const end = requireInteger(source.endByte, "surface source end", 1);
  if (end <= start || end - start > 32_768) throw new Error("Surface source range is invalid.");
  requireSha(source.sliceSha256, "surface source slice SHA");
  const selectorBody = {
    provenanceBridgeReceiptSha256: match.provenanceBridgeReceiptSha256,
    matchMethod: match.matchMethod,
    candidate: match.candidate,
    source: match.source,
  };
  if (sha256(JSON.stringify(selectorBody)) !== selectorSha || matchId !== `fsm-${selectorSha.slice(0, 24)}`) {
    throw new Error("Surface match selector identity is invalid.");
  }
}

function validateBasePacket(packet: Record<string, unknown>): void {
  if (!PACKET_ID.test(String(packet.packetId))) throw new Error("Review packet ID is invalid.");
  requireSha(packet.packetSha256, "review packet SHA");
  requireIso(packet.generatedAt, "review packet generatedAt");
  const source = requireRecord(packet.source, "review source");
  exactKeys(source, ["system", "bookId", "sourceRevision"]);
  if (source.system !== "inkos") throw new Error("Review source must be InkOS.");
  requireString(source.bookId, "review source bookId");
  requireString(source.sourceRevision, "review source revision");
  const work = requireRecord(packet.work, "review work");
  exactKeys(work, ["id", "title", "genre", "status", "targetChapters"]);
  for (const key of ["id", "title", "genre", "status"]) requireString(work[key], `review work ${key}`);
  requireInteger(work.targetChapters, "review work targetChapters", 1);
  const artifact = requireRecord(packet.artifact, "review artifact");
  exactKeys(artifact, ["id", "kind", "chapterNumber", "title", "status", "currentContent", "currentContentSha256"], []);
  if (artifact.kind !== "chapter") throw new Error("Review artifact must be a chapter.");
  requireString(artifact.id, "review artifact ID");
  requireInteger(artifact.chapterNumber, "review chapter number", 1);
  if (typeof artifact.title !== "string" || typeof artifact.currentContent !== "string") throw new Error("Review artifact text fields are invalid.");
  requireString(artifact.status, "review artifact status");
  const currentSha = requireSha(artifact.currentContentSha256, "current manuscript SHA");
  if (sha256(artifact.currentContent) !== currentSha) throw new Error("Current manuscript SHA mismatch.");
}

function validateV1(packet: Record<string, unknown>): FireflyReviewPacketV1 {
  exactKeys(packet, ["schemaVersion", "packetId", "packetSha256", "generatedAt", "source", "work", "artifact", "candidates", "recommendation", "actions", "authority"]);
  validateBasePacket(packet);
  if (JSON.stringify(packet.actions) !== JSON.stringify(["approve", "polish", "hold", "reject"])) throw new Error("Review actions are invalid.");
  const authority = requireRecord(packet.authority, "review authority");
  exactKeys(authority, ["canon", "decisionSurface", "apply", "reverseSync"]);
  if (authority.canon !== "inkos" || authority.decisionSurface !== "storyyard" || authority.apply !== "inkos" || authority.reverseSync !== false) {
    throw new Error("Review authority boundary is invalid.");
  }
  if (!Array.isArray(packet.candidates) || packet.candidates.length < 1) throw new Error("Review packet requires candidates.");
  for (const value of packet.candidates) {
    const candidate = requireRecord(value, "v1 review candidate");
    exactKeys(candidate, ["id", "status", "body", "sha256", "preparedAt", "commercialScore", "commercialEvaluation", "review"]);
    requireString(candidate.id, "v1 candidate ID");
    requireString(candidate.status, "v1 candidate status");
    if (typeof candidate.body !== "string") throw new Error("v1 candidate body is invalid.");
    if (sha256(candidate.body) !== requireSha(candidate.sha256, "v1 candidate SHA")) throw new Error("v1 candidate SHA mismatch.");
    requireIso(candidate.preparedAt, "v1 candidate preparedAt");
    if (candidate.commercialScore !== null) requireNumber(candidate.commercialScore, "v1 candidate score");
    const review = requireRecord(candidate.review, "v1 candidate review");
    exactKeys(review, ["status", "retained", "variedSurface", "linkedConsequences", "exactSurfaceMatches"]);
    requireString(review.status, "v1 review status");
    requireStrings(review.retained, "v1 retained");
    requireStrings(review.variedSurface, "v1 varied surface");
    requireStrings(review.linkedConsequences, "v1 linked consequences");
    if (!Array.isArray(review.exactSurfaceMatches)) throw new Error("v1 exact matches must be an array.");
  }
  return packet as unknown as FireflyReviewPacketV1;
}

function validateV2(packet: Record<string, unknown>): FireflyReviewPacketV2 {
  exactKeys(packet, ["schemaVersion", "packetId", "packetSha256", "generatedAt", "purpose", "source", "work", "artifact", "comparison", "candidates", "sealedGenerationEvidence", "recommendation", "actions", "authority"]);
  validateBasePacket(packet);
  if ((packet.source as Record<string, unknown>).bookId !== (packet.work as Record<string, unknown>).id) {
    throw new Error("Review packet source Book ID differs from its work ID.");
  }
  if (packet.purpose !== "promotion-evaluation") throw new Error("Blind v2 packets must be promotion evaluations.");
  if (packet.recommendation !== null) throw new Error("Blind v2 packets must not recommend a candidate.");
  const comparison = requireRecord(packet.comparison, "blind comparison");
  exactKeys(comparison, ["reviewKind", "pairId", "round", "blindRunId", "blindSessionId", "commonInputReceiptSha256", "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256", "runtimeReceiptSha256", "canaryIsolation", "candidateLabelsShuffled", "generatorMetadataExcluded", "runtime"]);
  if (comparison.reviewKind !== "independent-blind-comparison" || comparison.candidateLabelsShuffled !== true || comparison.generatorMetadataExcluded !== true) throw new Error("v2 comparison is not independently blinded.");
  requireSafeId(comparison.pairId, "comparison pair ID");
  if (!OPAQUE_PAIR_ID.test(String(comparison.pairId))) throw new Error("Comparison pair ID must be an opaque bp identifier.");
  if (![1, 2, 3].includes(comparison.round as number)) throw new Error("comparison round must be the number 1, 2, or 3.");
  requireSafeId(comparison.blindRunId, "blind run ID");
  requireSafeId(comparison.blindSessionId, "blind session ID");
  if (!OPAQUE_BLIND_ID.test(String(comparison.blindRunId)) || !OPAQUE_BLIND_ID.test(String(comparison.blindSessionId))) {
    throw new Error("Blind run and session IDs must be opaque br identifiers.");
  }
  if (comparison.blindRunId === comparison.blindSessionId) throw new Error("Blind comparison run and session IDs must be distinct.");
  for (const key of ["commonInputReceiptSha256", "pairedGenerationReceiptSha256", "labelAssignmentReceiptSha256", "runtimeReceiptSha256"]) requireSha(comparison[key], `comparison ${key}`);
  const comparisonIsolation = validateCanaryIsolation(comparison.canaryIsolation, "comparison canary isolation");
  const runtime = requireRecord(comparison.runtime, "comparison runtime");
  exactKeys(runtime, ["kernel", "piWorker", "retrieval", "fts", "model", "reasoning"]);
  if (runtime.kernel !== "enforce" || runtime.piWorker !== "off" || runtime.retrieval !== "legacy" || runtime.fts !== "off" || runtime.model !== "gpt-5.6-sol" || runtime.reasoning !== "high") throw new Error("comparison runtime is not the locked Phase 7 baseline.");

  if (!Array.isArray(packet.candidates) || packet.candidates.length !== 2) throw new Error("v2 blind comparison requires exactly two candidates.");
  const candidateIds: string[] = [];
  const matchIds = new Set<string>();
  let surfaceCorpus: string | null = null;
  const work = packet.work as Record<string, unknown>;
  const expectedSoulId = GENRE_SOUL_IDS[String(work.genre)];
  if (!expectedSoulId) throw new Error("Review packet genre is outside the locked male genre-Soul set.");
  for (const value of packet.candidates) {
    const candidate = requireRecord(value, "v2 review candidate");
    exactKeys(candidate, ["id", "kind", "evaluationBindingSha256", "canaryIsolation", "status", "body", "sha256", "preparedAt", "commercialScore", "commercialEvaluation", "commercialEvaluationReceiptSha256", "review"]);
    const id = requireString(candidate.id, "v2 candidate ID");
    candidateIds.push(id);
    if (candidate.kind !== "blind-pair-candidate") throw new Error("v2 candidates must use the blind-pair candidate kind.");
    requireSha(candidate.evaluationBindingSha256, "candidate evaluation binding SHA");
    const candidateIsolation = validateCanaryIsolation(candidate.canaryIsolation, "candidate canary isolation");
    if (JSON.stringify(candidateIsolation) !== JSON.stringify(comparisonIsolation)) {
      throw new Error("Candidate canary isolation does not match its blind comparison.");
    }
    requireString(candidate.status, "v2 candidate status");
    if (typeof candidate.body !== "string") throw new Error("v2 candidate body is invalid.");
    const candidateSha = requireSha(candidate.sha256, "v2 candidate SHA");
    if (sha256(candidate.body) !== candidateSha) throw new Error("v2 candidate SHA mismatch.");
    requireIso(candidate.preparedAt, "v2 candidate preparedAt");
    const commercialScore = requireNumber(candidate.commercialScore, "v2 independent commercial score");
    const evaluation = validateCommercialEvaluation(candidate.commercialEvaluation, "v2 commercial evaluation");
    const front = (evaluation.openingPressure + evaluation.protagonistAgency + evaluation.resistanceQuality + evaluation.visiblePayoff + evaluation.endingPropulsion) / 5;
    const reference = (evaluation.referenceEngineRetention + evaluation.transformationIntegrity + evaluation.styleFidelity) / 3;
    const expectedScore = Math.round(((front * 0.7) + (reference * 0.3)) * 10) / 10;
    if (commercialScore !== expectedScore) throw new Error("v2 commercial score does not match dopamine70-reference30-v1.");
    requireSha(candidate.commercialEvaluationReceiptSha256, "v2 commercial evaluation receipt SHA");
    if (candidate.commercialEvaluationReceiptSha256 !== comparison.runtimeReceiptSha256) {
      throw new Error("Candidate commercial evaluation receipt differs from the comparison runtime receipt.");
    }
    const review = requireRecord(candidate.review, "v2 candidate review");
    exactKeys(review, ["status", "retained", "variedSurface", "linkedConsequences", "emotionalCoherence", "contentNeutrality", "canonContradictions", "surfaceComparison"]);
    requireString(review.status, "v2 review status");
    requireStrings(review.retained, "v2 retained");
    requireStrings(review.variedSurface, "v2 varied surface");
    requireStrings(review.linkedConsequences, "v2 linked consequences");
    const emotional = requireRecord(review.emotionalCoherence, "emotional coherence");
    exactKeys(emotional, ["score", "evidence"]);
    requireNumber(emotional.score, "emotional coherence score");
    if (!Array.isArray(emotional.evidence) || emotional.evidence.length < 1) throw new Error("Emotional coherence evidence must be a non-empty array.");
    for (const span of emotional.evidence) validateCandidateSpan(span, candidate.body, "emotional evidence");
    const neutrality = requireRecord(review.contentNeutrality, "content neutrality");
    exactKeys(neutrality, ["passed", "violations"]);
    if (typeof neutrality.passed !== "boolean" || !Array.isArray(neutrality.violations)) throw new Error("Content neutrality is invalid.");
    for (const rawViolation of neutrality.violations) {
      const violation = requireRecord(rawViolation, "content neutrality violation");
      exactKeys(violation, ["code", "evidence"]);
      if (!CONTENT_NEUTRAL_CODES.has(String(violation.code)) || !Array.isArray(violation.evidence) || violation.evidence.length < 1) throw new Error("Content neutrality violation is invalid.");
      for (const span of violation.evidence) validateCandidateSpan(span, candidate.body, "content neutrality evidence");
    }
    if (neutrality.passed !== (neutrality.violations.length === 0)) throw new Error("Content neutrality pass flag contradicts violations.");
    if (!Array.isArray(review.canonContradictions)) throw new Error("Canon contradictions must be an array.");
    for (const rawContradiction of review.canonContradictions) {
      const contradiction = requireRecord(rawContradiction, "canon contradiction");
      exactKeys(contradiction, ["code", "evidence"]);
      if (contradiction.code !== "hard-canon-contradiction" || !Array.isArray(contradiction.evidence) || contradiction.evidence.length < 1) throw new Error("Canon contradiction is invalid.");
      for (const span of contradiction.evidence) validateCandidateSpan(span, candidate.body, "canon contradiction evidence");
    }
    const surface = requireRecord(review.surfaceComparison, "surface comparison");
    exactKeys(surface, ["schemaVersion", "soulId", "soulVersion", "surfaceIndexSha256", "surfaceMatches", "similarityPenaltyApplied", "automaticRewriteApplied", "automaticRejectApplied", "humanDecision"]);
    if (surface.schemaVersion !== "soul_corpus_comparison/v2" || surface.similarityPenaltyApplied !== false || surface.automaticRewriteApplied !== false || surface.automaticRejectApplied !== false || surface.humanDecision !== "pending") throw new Error("Surface comparison changed the candidate automatically.");
    requireString(surface.soulId, "surface Soul ID");
    requireString(surface.soulVersion, "surface Soul version");
    if (surface.soulId !== expectedSoulId || surface.soulVersion !== "v1") {
      throw new Error("Public surface Soul does not match the work genre.");
    }
    requireSha(surface.surfaceIndexSha256, "surface index SHA");
    if (!Array.isArray(surface.surfaceMatches)) throw new Error("Surface matches must be an array.");
    for (const match of surface.surfaceMatches) validateSurfaceMatch(match, candidate.body, candidateSha, matchIds);
    const candidateCorpus = JSON.stringify({
      soulId: surface.soulId,
      soulVersion: surface.soulVersion,
      surfaceIndexSha256: surface.surfaceIndexSha256,
    });
    if (surfaceCorpus !== null && surfaceCorpus !== candidateCorpus) {
      throw new Error("Blind candidates must use the same public surface corpus.");
    }
    surfaceCorpus = candidateCorpus;
  }
  if (JSON.stringify(candidateIds) !== JSON.stringify(BLIND_IDS)) {
    throw new Error("v2 candidate IDs must be ordered exactly as candidate-A then candidate-B.");
  }
  if ((packet.candidates as Array<Record<string, unknown>>)[0].sha256 === (packet.candidates as Array<Record<string, unknown>>)[1].sha256) {
    throw new Error("Blind comparison candidates must contain distinct manuscripts.");
  }
  const evidence = requireRecord(packet.sealedGenerationEvidence, "sealed generation evidence");
  exactKeys(evidence, ["candidateEvidenceReceiptSha256s", "contentNeutralReceiptSha256s"]);
  for (const key of ["candidateEvidenceReceiptSha256s", "contentNeutralReceiptSha256s"]) {
    const values = evidence[key];
    if (!Array.isArray(values) || values.length !== 2 || values.some((item) => typeof item !== "string" || !SHA.test(item)) || values[0] >= values[1]) {
      throw new Error(`${key} must contain two unique sorted SHA-256 values.`);
    }
  }
  const expectedNeutralEvidence = (packet.candidates as Array<Record<string, unknown>>).map((rawCandidate) => {
    const candidate = rawCandidate as unknown as FireflyReviewCandidateV2;
    return canonicalSha256({
      schemaVersion: "firefly-content-neutral-evaluation/v1",
      candidateId: candidate.id,
      candidateSha256: candidate.sha256,
      contentNeutrality: candidate.review.contentNeutrality,
    });
  }).sort();
  if (JSON.stringify(evidence.contentNeutralReceiptSha256s) !== JSON.stringify(expectedNeutralEvidence)) {
    throw new Error("Sealed content-neutral evidence does not match the public candidate evaluations.");
  }
  if (JSON.stringify(packet.actions) !== JSON.stringify(["select", "tie", "invalid"])) {
    throw new Error("Blind v2 actions must be select, tie, and invalid.");
  }
  const authority = requireRecord(packet.authority, "blind review authority");
  exactKeys(authority, ["canon", "decisionSurface", "decisionEffect", "manuscriptApply", "reverseSync"]);
  if (authority.canon !== "inkos" || authority.decisionSurface !== "storyyard"
    || authority.decisionEffect !== "advisory" || authority.manuscriptApply !== false || authority.reverseSync !== false) {
    throw new Error("Blind v2 authority must stay advisory and non-applying.");
  }
  return packet as unknown as FireflyReviewPacketV2;
}

export function assertFireflyReviewPacketIdentity(packet: FireflyReviewPacket): void {
  const unsigned = { ...packet } as Record<string, unknown>;
  delete unsigned.schemaVersion;
  delete unsigned.packetId;
  delete unsigned.packetSha256;
  if (packet.schemaVersion === "firefly_review_packet/v1") delete unsigned.generatedAt;
  const actual = sha256(JSON.stringify(unsigned));
  if (actual !== packet.packetSha256 || packet.packetId !== `frp-${actual.slice(0, 24)}`) throw new Error("Review packet identity or SHA-256 mismatch.");
}

export function validateFireflyReviewPacket(value: unknown): FireflyReviewPacket {
  const packet = requireRecord(value, "review packet");
  const parsed = packet.schemaVersion === "firefly_review_packet/v1"
    ? validateV1(packet)
    : packet.schemaVersion === "firefly_review_packet/v2"
      ? validateV2(packet)
      : (() => { throw new Error("Unsupported Firefly review packet schema."); })();
  assertFireflyReviewPacketIdentity(parsed);
  return parsed;
}

export function allSurfaceMatches(packet: FireflyReviewPacket): FireflySurfaceMatch[] {
  if (packet.schemaVersion !== "firefly_review_packet/v2") return [];
  return packet.candidates.flatMap((candidate) => candidate.review.surfaceComparison.surfaceMatches);
}
