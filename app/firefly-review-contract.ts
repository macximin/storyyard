import { createHash } from "node:crypto";
import { validateVariationReviewPacketV5, variationReviewHash, type FireflyVariationReviewPacketV5 } from "./firefly-variation-review-contract.ts";
export type { FireflyVariationReviewCandidateV5, FireflyVariationReviewPacketV5 } from "./firefly-variation-review-contract.ts";

export type FireflyManuscriptDecision = "approve" | "polish" | "hold" | "reject";
export type FireflyEvaluationDecision = "select" | "tie" | "invalid";
export type FireflyPlanningDecision = "select" | "hold" | "reject";
export type FireflyDecision = FireflyManuscriptDecision | FireflyEvaluationDecision | FireflyPlanningDecision;
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
      model: "gpt-5.6-sol" | "gpt-6-astra";
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

export type FireflyEntryContract = {
  humanDrive: {
    lackOrHumiliation: string;
    personalDesire: string;
    selfInterest: string;
    emotionalCostLimit: string;
  };
  purpose: {
    seriesWhat: string;
    arcWhat: string;
    chapterWant: string;
    whyNow: string;
  };
  commercialPromise: {
    currentSituation: string;
    repeatableReaderFantasy: string;
    howAdvantage: string;
    firstPayoff: string;
    payoffWitness: string;
    nextPaymentQuestion: string;
  };
};

type FireflySpineRetentionCommon = {
  primaryReference: { packId: string; packSha256: string; sourceSha256: string };
  referenceDisclosure: {
    workSlug: string; workTitle: string;
    usageRoles: Array<"commercial-engine" | "opening-event" | "relationship" | "payoff" | "style">;
    selectionReason: string; preservedElements: string[]; transformedElements: string[];
  };
  preservedEngine: { industry: string; repeatedVerb: string; progressionLadder: string; rewardGrammar: string };
  openingEpisodeMappings: Array<{ episode: number; sourceBeatSequence: number; sourceArcId: string; retainedFunction: string; transformedEvent: string }>;
  hookProgression: Array<{ sourceArcId: string; retainedFunction: string; transformedHook: string }>;
  surfaceChanges: Array<{ layer: "people" | "organization" | "object" | "location" | "local-cause" | "number" | "scene-dressing"; change: string; causalAdjustment: string }>;
};

export type FireflySpineRetentionV1 = FireflySpineRetentionCommon & {
  schemaVersion: "firefly_spine_retention/v1";
  relationshipConversion: { sourceFunction: string; transformedExpression: string };
  payoffPair: { material: string; emotional: string; witness: string };
};

export type FireflySpineRetentionV2 = FireflySpineRetentionCommon & {
  schemaVersion: "firefly_spine_retention/v2";
  sourceReconstruction: {
    protagonist: string; personalGoal: string; longTermGoal: string; firstArcGoal: string;
    priorityRule: string; verifiedScope: string; uncertainty: string;
  };
  decisionComparisons: Array<{
    sourceSequenceStart: number; sourceSequenceEnd: number; sourceArcId: string;
    sourceChoice: string; sourceGain: string; targetChoice: string; targetGain: string; preservedReason: string;
  }>;
  rewards: Array<{ kind: string; sourceReward: string; targetReward: string; beneficiary: string; witness: string | null }>;
  relationshipConversion: { sourceFunction: string; transformedExpression: string } | null;
};

export type FireflyPitchReviewCandidateV3 = {
  id: string;
  sha256: string;
  titleCandidates: string[];
  oneLinePromise: string;
  entryContract: FireflyEntryContract;
  protagonist: { startingIdentity: string; repeatedVerb: string; firstAsset: string };
  openingEpisodes: Array<{ episode: number; event: string; visiblePayoff: string }>;
  firstReward: string;
  railA: string[];
  railB: string[];
  arcLadder: Array<{ arc: number; externalMove: string; visibleReward: string; relationshipConversion: string | null }>;
  longRunRisk: string;
  sourcePremise?: {
    slateId: string; candidateId: string; candidateSha256: string;
    privateWant: string; firstChoice: string; emotionalPayment: string;
  };
  spineRetention?: FireflySpineRetentionV1 | FireflySpineRetentionV2;
  projectPlan?: { format: "webnovel-project-plan/v1"; markdown: string };
  independentReview: {
    sourceChecks?: {
      selfInterest: { passed: boolean; evidence: string };
      sourceFidelity: { passed: boolean; evidence: string };
      commercialReading: { assessment: string; evidence: string };
    };
    verdict: "SURVIVE" | "HOLD" | "KILL";
    independentScore: {
      promise: number;
      earlyPayoff: number;
      repeatEngine: number;
      railConversion: number;
      longRunSupply: number;
      total: number;
    };
    entryGate: {
      passed: boolean;
      protagonistNow: string;
      personalWant: string;
      whyNow: string;
      repeatableFantasy: string;
      chapterGoal: string;
      failureReasons: string[];
    };
    decisiveStrength: string;
    decisiveRisk: string;
    requiredRepair: string;
  };
};

export type FireflyReviewPacketV3 = {
  schemaVersion: "firefly_review_packet/v3";
  packetId: string;
  packetSha256: string;
  generatedAt: string;
  purpose: "planning-entry";
  source: { system: "inkos"; slateId: string; sourceRevision: string };
  work: { id: string; title: string; genre: string; status: "non-canonical"; targetChapters: number };
  artifact: { id: string; kind: "pitch-slate"; title: string; status: "human-decision-pending" };
  candidates: FireflyPitchReviewCandidateV3[];
  recommendation: { candidateId: string; reason: string } | null;
  actions: ["select", "hold", "reject"];
  authority: {
    canon: "inkos";
    decisionSurface: "storyyard";
    decisionEffect: "planning-selection";
    manuscriptApply: false;
    reverseSync: false;
  };
};

export type FireflyHumanPremiseCandidateV4 = {
  id: string;
  sha256: string;
  titleCandidates: string[];
  oneLineHumanPromise: string;
  humanPremise: {
    protagonistAsPerson: string;
    privateWant: string;
    feltLack: string;
    targetPerson: string;
    whyToday: string;
    firstChoice: string;
    emotionalPayment: string;
    stillHumanWithoutPower: string;
  };
  firstScene: { currentSituation: string; pressure: string; action: string; witnessedChange: string };
  sourceBeatSequences: number[];
  styleExampleIds: string[];
  retainedReferenceTraits: string[];
  surfaceVariation: string;
  independentReview: {
    candidateId: string;
    verdict: "SURVIVE" | "HOLD" | "KILL";
    gates: { humanDesire: boolean; sourceGrounded: boolean; sceneableToday: boolean; nonMechanical: boolean; voiceGrounded: boolean };
    decisiveStrength: string;
    decisiveRisk: string;
    requiredRepair: string;
  };
};

export type FireflyReviewPacketV4 = {
  schemaVersion: "firefly_review_packet/v4";
  packetId: string;
  packetSha256: string;
  generatedAt: string;
  purpose: "human-premise";
  source: { system: "inkos"; slateId: string; sourceRevision: string };
  work: { id: string; title: string; genre: "modern-fantasy-ko"; status: "non-canonical" };
  artifact: { id: string; kind: "human-premise-slate"; title: string; status: "human-decision-pending" };
  sourceBinding: {
    schemaVersion: "firefly_pitch_source_binding/v1";
    packId: string; packSha256: string; sourceSha256: string;
    sourceWork?: { workSlug: string; workTitle: string };
    storyIndex: { path: string; sha256: string; selected: Array<{ sequence: number; arcId: string; sourceLineRange: { start: number; end: number }; sourceCharacterRange: { start: number; end: number }; rawProseSha256: string }> };
    styleExamples: { path: string; sha256: string; selected: Array<{ id: string; sequence: number; arcId: string; rawProseSha256: string }> };
    structureInputs: Array<{ role: "project-bible" | "chapter-map" | "arc-atlas"; path: string; sha256: string }>;
  };
  runtimeReceipt: FireflyPitchRuntimeReceiptV4;
  reviewerRuntimeReceipt: FireflyPitchRuntimeReceiptV4;
  candidates: FireflyHumanPremiseCandidateV4[];
  recommendation: { candidateId: string; reason: string } | null;
  actions: ["select", "hold", "reject"];
  authority: { canon: "inkos"; decisionSurface: "storyyard"; decisionEffect: "human-premise-selection"; commercialExpansion: false; bookCreation: false; manuscriptApply: false; reverseSync: false };
};

type FireflyPitchRuntimeReceiptV4 = {
  schemaVersion: "firefly_pitch_runtime/v1";
  provider: "codex-cli";
  model: "gpt-5.6-sol" | "gpt-6-astra";
  reasoning: "high";
  soul: { mode: "canary-scoped"; soulId: "male-modern-fantasy-ko"; version: "v1"; manifestSha256: string; promptSha256: string; resourceSha256: string };
};

export type FireflyReviewPacket = FireflyReviewPacketV1 | FireflyReviewPacketV2 | FireflyReviewPacketV3 | FireflyReviewPacketV4 | FireflyVariationReviewPacketV5;

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
  if (runtime.kernel !== "enforce" || runtime.piWorker !== "off" || runtime.retrieval !== "legacy" || runtime.fts !== "off"
    || (runtime.model !== "gpt-5.6-sol" && runtime.model !== "gpt-6-astra") || runtime.reasoning !== "high") {
    throw new Error("comparison runtime is not a supported Sol/Astra high Phase 7 baseline.");
  }

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

function validateEntryContract(value: unknown): void {
  const contract = requireRecord(value, "planning entry contract");
  exactKeys(contract, ["humanDrive", "purpose", "commercialPromise"]);
  const humanDrive = requireRecord(contract.humanDrive, "planning human drive");
  exactKeys(humanDrive, ["lackOrHumiliation", "personalDesire", "selfInterest", "emotionalCostLimit"]);
  for (const key of ["lackOrHumiliation", "personalDesire", "selfInterest", "emotionalCostLimit"]) {
    requireString(humanDrive[key], `planning human drive ${key}`);
  }
  const purpose = requireRecord(contract.purpose, "planning purpose");
  exactKeys(purpose, ["seriesWhat", "arcWhat", "chapterWant", "whyNow"]);
  for (const key of ["seriesWhat", "arcWhat", "chapterWant", "whyNow"]) {
    requireString(purpose[key], `planning purpose ${key}`);
  }
  const promise = requireRecord(contract.commercialPromise, "planning commercial promise");
  exactKeys(promise, ["currentSituation", "repeatableReaderFantasy", "howAdvantage", "firstPayoff", "payoffWitness", "nextPaymentQuestion"]);
  for (const key of ["currentSituation", "repeatableReaderFantasy", "howAdvantage", "firstPayoff", "payoffWitness", "nextPaymentQuestion"]) {
    requireString(promise[key], `planning commercial promise ${key}`);
  }
}

function validatePitchScore(value: unknown): void {
  const score = requireRecord(value, "planning independent score");
  const keys = ["promise", "earlyPayoff", "repeatEngine", "railConversion", "longRunSupply"];
  exactKeys(score, [...keys, "total"]);
  for (const key of keys) requireInteger(score[key], `planning score ${key}`);
  const total = requireInteger(score.total, "planning score total");
  if (keys.reduce((sum, key) => sum + Number(score[key]), 0) !== total || total > 100) {
    throw new Error("Planning score total must equal its five components and stay within 100.");
  }
}

function requireNonblank(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!text.trim()) throw new Error(`${label} must not be blank.`);
  return text;
}

function requirePlanningText(value: unknown, label: string): string {
  const text = requireNonblank(value, label);
  if (text.trim().length < 4 || text.trim().length > 2_000) throw new Error(`${label} must contain 4 to 2000 characters.`);
  return text;
}

function validateSpineRetention(value: unknown): boolean {
  const spine = requireRecord(value, "spine retention");
  const sourceFirst = spine.schemaVersion === "firefly_spine_retention/v2";
  if (!sourceFirst && spine.schemaVersion !== "firefly_spine_retention/v1") throw new Error("Spine retention schema is invalid.");
  exactKeys(spine, ["schemaVersion", "primaryReference", "referenceDisclosure", "preservedEngine", "openingEpisodeMappings", "relationshipConversion", "hookProgression", "surfaceChanges", ...(sourceFirst ? ["sourceReconstruction", "decisionComparisons", "rewards"] : ["payoffPair"])]);
  const text = sourceFirst ? requirePlanningText : requireString;
  const nonblank = sourceFirst ? requireNonblank : requireString;
  const primary = requireRecord(spine.primaryReference, "spine primary reference");
  exactKeys(primary, ["packId", "packSha256", "sourceSha256"]);
  nonblank(primary.packId, "spine pack ID"); requireSha(primary.packSha256, "spine pack SHA"); requireSha(primary.sourceSha256, "spine source SHA");
  const disclosure = requireRecord(spine.referenceDisclosure, "reference disclosure");
  exactKeys(disclosure, ["workSlug", "workTitle", "usageRoles", "selectionReason", "preservedElements", "transformedElements"]);
  nonblank(disclosure.workSlug, "reference work slug"); nonblank(disclosure.workTitle, "reference work title");
  const usageRoles = requireStrings(disclosure.usageRoles, "reference usage roles");
  const allowedRoles = new Set(["commercial-engine", "opening-event", "relationship", "payoff", "style"]);
  if (usageRoles.length < 1 || (sourceFirst && usageRoles.length > 5) || usageRoles.some((role) => !allowedRoles.has(role))) throw new Error("Reference usage role is invalid.");
  const preserved = requireStrings(disclosure.preservedElements, "reference preserved elements");
  const transformed = requireStrings(disclosure.transformedElements, "reference transformed elements");
  if (preserved.length < 4 || transformed.length < 1) throw new Error("Reference disclosure must name preserved and transformed elements.");
  text(disclosure.selectionReason, "reference selection reason");
  if (sourceFirst) {
    if (preserved.length > 12 || transformed.length > 12) throw new Error("Reference disclosure exceeds its element limit.");
    for (const item of [...preserved, ...transformed]) text(item, "reference disclosure element");
  }
  const engine = requireRecord(spine.preservedEngine, "preserved engine");
  exactKeys(engine, ["industry", "repeatedVerb", "progressionLadder", "rewardGrammar"]);
  for (const key of ["industry", "repeatedVerb", "progressionLadder", "rewardGrammar"]) text(engine[key], `preserved engine ${key}`);
  if (!Array.isArray(spine.openingEpisodeMappings) || spine.openingEpisodeMappings.length !== 4) throw new Error("Spine retention requires four opening mappings.");
  const mappedBeats = new Set<number>();
  spine.openingEpisodeMappings.forEach((rawMapping, index) => {
    const mapping = requireRecord(rawMapping, "spine opening mapping");
    exactKeys(mapping, ["episode", "sourceBeatSequence", "sourceArcId", "retainedFunction", "transformedEvent"]);
    if (requireInteger(mapping.episode, "spine episode", 1) !== index + 1) throw new Error("Spine mappings must be ordered 1 through 4.");
    mappedBeats.add(requireInteger(mapping.sourceBeatSequence, "source beat sequence", 1));
    nonblank(mapping.sourceArcId, "spine mapping sourceArcId");
    for (const key of ["retainedFunction", "transformedEvent"]) text(mapping[key], `spine mapping ${key}`);
  });
  if (mappedBeats.size < 2) throw new Error("Spine retention must use at least two source beats.");
  if (!(sourceFirst && spine.relationshipConversion === null)) {
    const relation = requireRecord(spine.relationshipConversion, "spine relationship conversion");
    exactKeys(relation, ["sourceFunction", "transformedExpression"]);
    text(relation.sourceFunction, "source relationship function"); text(relation.transformedExpression, "transformed relationship expression");
  }
  if (!Array.isArray(spine.hookProgression) || spine.hookProgression.length < (sourceFirst ? 0 : 2) || (sourceFirst && spine.hookProgression.length > 12)) throw new Error("Spine retention requires hook progression.");
  for (const rawHook of spine.hookProgression) {
    const hook = requireRecord(rawHook, "spine hook"); exactKeys(hook, ["sourceArcId", "retainedFunction", "transformedHook"]);
    nonblank(hook.sourceArcId, "spine hook sourceArcId");
    for (const key of ["retainedFunction", "transformedHook"]) text(hook[key], `spine hook ${key}`);
  }
  if (!Array.isArray(spine.surfaceChanges) || spine.surfaceChanges.length < 1 || (sourceFirst && spine.surfaceChanges.length > 14)) throw new Error("Spine retention requires surface changes.");
  const allowedLayers = new Set(["people", "organization", "object", "location", "local-cause", "number", "scene-dressing"]);
  for (const rawChange of spine.surfaceChanges) {
    const change = requireRecord(rawChange, "spine surface change"); exactKeys(change, ["layer", "change", "causalAdjustment"]);
    if (!allowedLayers.has(String(change.layer))) throw new Error("Spine surface layer is invalid.");
    text(change.change, "spine surface change"); text(change.causalAdjustment, "spine causal adjustment");
  }
  if (sourceFirst) {
    const reconstruction = requireRecord(spine.sourceReconstruction, "source reconstruction");
    const reconstructionKeys = ["protagonist", "personalGoal", "longTermGoal", "firstArcGoal", "priorityRule", "verifiedScope", "uncertainty"];
    exactKeys(reconstruction, reconstructionKeys);
    for (const key of reconstructionKeys) text(reconstruction[key], `source reconstruction ${key}`);
    if (!Array.isArray(spine.decisionComparisons) || spine.decisionComparisons.length < 1 || spine.decisionComparisons.length > 24) throw new Error("Source-first spine requires 1 to 24 decision comparisons.");
    for (const rawComparison of spine.decisionComparisons) {
      const comparison = requireRecord(rawComparison, "source decision comparison");
      exactKeys(comparison, ["sourceSequenceStart", "sourceSequenceEnd", "sourceArcId", "sourceChoice", "sourceGain", "targetChoice", "targetGain", "preservedReason"]);
      const start = requireInteger(comparison.sourceSequenceStart, "source sequence start", 1);
      const end = requireInteger(comparison.sourceSequenceEnd, "source sequence end", 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) throw new Error("Source decision sequence range is invalid.");
      requireNonblank(comparison.sourceArcId, "source decision Arc ID");
      for (const key of ["sourceChoice", "sourceGain", "targetChoice", "targetGain", "preservedReason"]) text(comparison[key], `source comparison ${key}`);
    }
    if (!Array.isArray(spine.rewards) || spine.rewards.length < 1 || spine.rewards.length > 24) throw new Error("Source-first spine requires 1 to 24 rewards.");
    for (const rawReward of spine.rewards) {
      const reward = requireRecord(rawReward, "source-first reward");
      exactKeys(reward, ["kind", "sourceReward", "targetReward", "beneficiary", "witness"]);
      if (requireNonblank(reward.kind, "reward kind").trim().length > 80) throw new Error("Reward kind exceeds 80 characters.");
      for (const key of ["sourceReward", "targetReward"]) text(reward[key], `source-first reward ${key}`);
      if (requireNonblank(reward.beneficiary, "source-first reward beneficiary").trim().length > 2_000) throw new Error("Source-first reward beneficiary exceeds 2000 characters.");
      if (reward.witness !== null) text(reward.witness, "source-first reward witness");
    }
  } else {
    const payoff = requireRecord(spine.payoffPair, "spine payoff pair"); exactKeys(payoff, ["material", "emotional", "witness"]);
    for (const key of ["material", "emotional", "witness"]) text(payoff[key], `spine payoff ${key}`);
  }
  return sourceFirst;
}

function validateV3(packet: Record<string, unknown>): FireflyReviewPacketV3 {
  exactKeys(packet, ["schemaVersion", "packetId", "packetSha256", "generatedAt", "purpose", "source", "work", "artifact", "candidates", "recommendation", "actions", "authority"]);
  if (!PACKET_ID.test(String(packet.packetId))) throw new Error("Review packet ID is invalid.");
  requireSha(packet.packetSha256, "review packet SHA");
  requireIso(packet.generatedAt, "review packet generatedAt");
  if (packet.purpose !== "planning-entry") throw new Error("v3 packets must be planning-entry reviews.");

  const source = requireRecord(packet.source, "planning review source");
  exactKeys(source, ["system", "slateId", "sourceRevision"]);
  if (source.system !== "inkos") throw new Error("Planning review source must be InkOS.");
  requireSafeId(source.slateId, "planning slate ID");
  requireSha(source.sourceRevision, "planning source revision");

  const work = requireRecord(packet.work, "planning review work");
  exactKeys(work, ["id", "title", "genre", "status", "targetChapters"]);
  requireSafeId(work.id, "planning work ID");
  requireString(work.title, "planning work title");
  requireString(work.genre, "planning work genre");
  if (work.status !== "non-canonical") throw new Error("Planning review work must remain non-canonical.");
  requireInteger(work.targetChapters, "planning target chapters", 1);
  if (source.slateId !== work.id) throw new Error("Planning source slate ID differs from its work ID.");

  const artifact = requireRecord(packet.artifact, "planning review artifact");
  exactKeys(artifact, ["id", "kind", "title", "status"]);
  requireSafeId(artifact.id, "planning artifact ID");
  requireString(artifact.title, "planning artifact title");
  if (artifact.kind !== "pitch-slate" || artifact.status !== "human-decision-pending") {
    throw new Error("Planning artifact must be a pending pitch slate.");
  }
  if (artifact.id !== source.slateId) throw new Error("Planning artifact ID differs from its source slate ID.");

  if (!Array.isArray(packet.candidates) || packet.candidates.length < 1 || packet.candidates.length > 20) {
    throw new Error("Planning review requires between one and twenty candidates.");
  }
  const candidateIds = new Set<string>();
  const survivorIds: string[] = [];
  for (const rawCandidate of packet.candidates) {
    const candidate = requireRecord(rawCandidate, "planning candidate");
    exactKeys(candidate, ["id", "sha256", "titleCandidates", "oneLinePromise", "entryContract", "protagonist", "openingEpisodes", "firstReward", "railA", "railB", "arcLadder", "longRunRisk", "independentReview"], ["sourcePremise", "spineRetention", "projectPlan"]);
    const id = requireString(candidate.id, "planning candidate ID");
    if (!/^p\d{2}$/u.test(id) || candidateIds.has(id)) throw new Error("Planning candidate IDs must be unique pNN values.");
    candidateIds.add(id);
    const candidateSha = requireSha(candidate.sha256, "planning candidate SHA");
    const unsigned = { ...candidate };
    delete unsigned.sha256;
    if (canonicalSha256(unsigned) !== candidateSha) throw new Error("Planning candidate SHA mismatch.");
    const titles = requireStrings(candidate.titleCandidates, "planning candidate titles");
    if (titles.length < 1 || titles.length > 3 || titles.some((title) => !title)) throw new Error("Planning candidate requires one to three titles.");
    requireString(candidate.oneLinePromise, "planning one-line promise");
    validateEntryContract(candidate.entryContract);
    const protagonist = requireRecord(candidate.protagonist, "planning protagonist");
    exactKeys(protagonist, ["startingIdentity", "repeatedVerb", "firstAsset"]);
    for (const key of ["startingIdentity", "repeatedVerb", "firstAsset"]) requireString(protagonist[key], `planning protagonist ${key}`);
    if (!Array.isArray(candidate.openingEpisodes) || candidate.openingEpisodes.length !== 4) throw new Error("Planning candidate requires exactly four opening episodes.");
    candidate.openingEpisodes.forEach((rawEpisode, index) => {
      const episode = requireRecord(rawEpisode, "planning opening episode");
      exactKeys(episode, ["episode", "event", "visiblePayoff"]);
      if (requireInteger(episode.episode, "opening episode number", 1) !== index + 1) throw new Error("Opening episodes must be ordered 1 through 4.");
      requireString(episode.event, "opening episode event");
      requireString(episode.visiblePayoff, "opening episode payoff");
    });
    const hasPremise = candidate.sourcePremise !== undefined;
    const hasSpine = candidate.spineRetention !== undefined;
    const sourceFirst = hasSpine ? validateSpineRetention(candidate.spineRetention) : false;
    if ((hasPremise && (!hasSpine || sourceFirst)) || (hasSpine && !sourceFirst && !hasPremise)) {
      throw new Error("Planning source premise and spine retention combination is invalid: legacy v1 requires a premise; source-first v2 forbids one.");
    }
    if (hasPremise) {
      const premise = requireRecord(candidate.sourcePremise, "planning source premise");
      exactKeys(premise, ["slateId", "candidateId", "candidateSha256", "privateWant", "firstChoice", "emotionalPayment"]);
      requireSafeId(premise.slateId, "source premise slate ID");
      if (!/^p\d{2}$/u.test(requireString(premise.candidateId, "source premise candidate ID"))) throw new Error("Source premise candidate ID is invalid.");
      requireSha(premise.candidateSha256, "source premise candidate SHA");
      for (const key of ["privateWant", "firstChoice", "emotionalPayment"]) requireString(premise[key], `source premise ${key}`);
    }
    if (sourceFirst) {
      const plan = requireRecord(candidate.projectPlan, "source-first project plan");
      exactKeys(plan, ["format", "markdown"]);
      if (plan.format !== "webnovel-project-plan/v1") throw new Error("Project plan format is invalid.");
      const markdown = requireNonblank(plan.markdown, "project plan Markdown");
      if (markdown.trim().length < 600 || markdown.trim().length > 30_000) throw new Error("Project plan Markdown must contain 600 to 30000 characters.");
    } else if (candidate.projectPlan !== undefined) {
      throw new Error("Project plan requires source-first spine v2.");
    }
    requireString(candidate.firstReward, "planning first reward");
    for (const [key, minimum] of [["railA", 3], ["railB", sourceFirst ? 0 : 3]] as const) {
      const values = requireStrings(candidate[key], `planning ${key}`);
      if (values.length < minimum || values.some((item) => sourceFirst ? !item.trim() : !item)) throw new Error(`Planning ${key} is too short.`);
    }
    if (!Array.isArray(candidate.arcLadder) || candidate.arcLadder.length < 6) throw new Error("Planning candidate requires at least six Arc steps.");
    candidate.arcLadder.forEach((rawArc) => {
      const arc = requireRecord(rawArc, "planning Arc");
      exactKeys(arc, ["arc", "externalMove", "visibleReward", "relationshipConversion"]);
      requireInteger(arc.arc, "planning Arc number", 1);
      requireString(arc.externalMove, "planning Arc move");
      requireString(arc.visibleReward, "planning Arc reward");
      if (!(sourceFirst && arc.relationshipConversion === null)) {
        (sourceFirst ? requireNonblank : requireString)(arc.relationshipConversion, "planning Arc relationship conversion");
      }
    });
    requireString(candidate.longRunRisk, "planning long-run risk");
    const review = requireRecord(candidate.independentReview, "planning independent review");
    exactKeys(review, ["verdict", "independentScore", "entryGate", "decisiveStrength", "decisiveRisk", "requiredRepair"], ["sourceChecks"]);
    if (!["SURVIVE", "HOLD", "KILL"].includes(String(review.verdict))) throw new Error("Planning review verdict is invalid.");
    validatePitchScore(review.independentScore);
    const gate = requireRecord(review.entryGate, "planning entry gate");
    exactKeys(gate, ["passed", "protagonistNow", "personalWant", "whyNow", "repeatableFantasy", "chapterGoal", "failureReasons"]);
    if (typeof gate.passed !== "boolean") throw new Error("Planning entry gate pass flag is invalid.");
    for (const key of ["protagonistNow", "personalWant", "whyNow", "repeatableFantasy", "chapterGoal"]) requireString(gate[key], `planning entry gate ${key}`);
    const failures = requireStrings(gate.failureReasons, "planning entry gate failures");
    if (gate.passed !== (failures.length === 0)) throw new Error("Planning entry gate pass flag contradicts its failures.");
    if (gate.passed === false && review.verdict === "SURVIVE") throw new Error("A failed planning entry gate cannot SURVIVE.");
    if (sourceFirst) {
      const checks = requireRecord(review.sourceChecks, "source-first independent checks");
      exactKeys(checks, ["selfInterest", "sourceFidelity", "commercialReading"]);
      for (const key of ["selfInterest", "sourceFidelity"]) {
        const check = requireRecord(checks[key], `independent source check ${key}`);
        exactKeys(check, ["passed", "evidence"]);
        if (typeof check.passed !== "boolean") throw new Error(`Independent source check ${key} pass flag is invalid.`);
        requireNonblank(check.evidence, `independent source check ${key} evidence`);
        if (!check.passed && gate.passed) throw new Error("A failed source self-interest or fidelity check must fail the planning entry gate.");
      }
      const reading = requireRecord(checks.commercialReading, "independent commercial reading");
      exactKeys(reading, ["assessment", "evidence"]);
      requireNonblank(reading.assessment, "independent commercial reading assessment");
      requireNonblank(reading.evidence, "independent commercial reading evidence");
    } else if (review.sourceChecks !== undefined) {
      throw new Error("Independent source checks require source-first spine v2.");
    }
    for (const key of ["decisiveStrength", "decisiveRisk", "requiredRepair"]) requireString(review[key], `planning independent review ${key}`);
    if (review.verdict === "SURVIVE") survivorIds.push(id);
  }

  const recommendation = packet.recommendation === null ? null : requireRecord(packet.recommendation, "planning recommendation");
  if (recommendation) {
    exactKeys(recommendation, ["candidateId", "reason"]);
    requireString(recommendation.candidateId, "planning recommendation candidate ID");
    requireString(recommendation.reason, "planning recommendation reason");
    if (!candidateIds.has(String(recommendation.candidateId))) throw new Error("Planning recommendation candidate is absent.");
  }
  if (survivorIds.length > 1 || (recommendation?.candidateId ?? null) !== (survivorIds[0] ?? null)) {
    throw new Error("Planning recommendation must match the sole SURVIVE candidate.");
  }
  if (JSON.stringify(packet.actions) !== JSON.stringify(["select", "hold", "reject"])) throw new Error("Planning actions must be select, hold, and reject.");
  const authority = requireRecord(packet.authority, "planning review authority");
  exactKeys(authority, ["canon", "decisionSurface", "decisionEffect", "manuscriptApply", "reverseSync"]);
  if (authority.canon !== "inkos" || authority.decisionSurface !== "storyyard" || authority.decisionEffect !== "planning-selection" || authority.manuscriptApply !== false || authority.reverseSync !== false) {
    throw new Error("Planning review authority boundary is invalid.");
  }
  return packet as unknown as FireflyReviewPacketV3;
}

function validatePremiseRuntime(value: unknown, label: string): void {
  const runtime = requireRecord(value, label);
  exactKeys(runtime, ["schemaVersion", "provider", "model", "reasoning", "soul"]);
  if (runtime.schemaVersion !== "firefly_pitch_runtime/v1" || runtime.provider !== "codex-cli"
    || (runtime.model !== "gpt-5.6-sol" && runtime.model !== "gpt-6-astra") || runtime.reasoning !== "high") {
    throw new Error(`${label} must be a supported codex/Sol-or-Astra/high runtime.`);
  }
  const soul = requireRecord(runtime.soul, `${label} Soul`);
  exactKeys(soul, ["mode", "soulId", "version", "manifestSha256", "promptSha256", "resourceSha256"]);
  if (soul.mode !== "canary-scoped" || soul.soulId !== "male-modern-fantasy-ko" || soul.version !== "v1") {
    throw new Error(`${label} must use the candidate-scoped male modern-fantasy Soul.`);
  }
  for (const key of ["manifestSha256", "promptSha256", "resourceSha256"]) requireSha(soul[key], `${label} Soul ${key}`);
}

function validatePremiseSourceBinding(value: unknown): void {
  const binding = requireRecord(value, "Human Premise source binding");
  exactKeys(binding, ["schemaVersion", "packId", "packSha256", "sourceSha256", "storyIndex", "styleExamples", "structureInputs"], ["sourceWork"]);
  if (binding.schemaVersion !== "firefly_pitch_source_binding/v1") throw new Error("Human Premise source binding schema is invalid.");
  requireSafeId(binding.packId, "Human Premise pack ID");
  requireSha(binding.packSha256, "Human Premise pack SHA");
  requireSha(binding.sourceSha256, "Human Premise source SHA");
  if (binding.sourceWork !== undefined) {
    const sourceWork = requireRecord(binding.sourceWork, "Human Premise source work");
    exactKeys(sourceWork, ["workSlug", "workTitle"]);
    requireString(sourceWork.workSlug, "Human Premise source work slug");
    requireString(sourceWork.workTitle, "Human Premise source work title");
  }
  for (const key of ["storyIndex", "styleExamples"] as const) {
    const collection = requireRecord(binding[key], `Human Premise ${key}`);
    exactKeys(collection, ["path", "sha256", "selected"]);
    requireString(collection.path, `Human Premise ${key} path`);
    requireSha(collection.sha256, `Human Premise ${key} SHA`);
    if (!Array.isArray(collection.selected) || collection.selected.length < 1) throw new Error(`Human Premise ${key} selection is empty.`);
    const ids = new Set<string>();
    for (const raw of collection.selected) {
      const item = requireRecord(raw, `Human Premise ${key} item`);
      const fields = key === "storyIndex" ? ["sequence", "arcId", "rawProseSha256"] : ["id", "sequence", "arcId", "rawProseSha256"];
      exactKeys(item, fields, key === "storyIndex" ? ["sourceLineRange", "sourceCharacterRange"] : []);
      requireInteger(item.sequence, `Human Premise ${key} sequence`, 1);
      requireString(item.arcId, `Human Premise ${key} Arc ID`);
      requireSha(item.rawProseSha256, `Human Premise ${key} prose SHA`);
      if (key === "storyIndex" && (item.sourceLineRange === undefined) !== (item.sourceCharacterRange === undefined)) {
        throw new Error("Human Premise source line and character ranges must appear together.");
      }
      if (key === "storyIndex" && item.sourceLineRange !== undefined && item.sourceCharacterRange !== undefined) {
        for (const rangeKey of ["sourceLineRange", "sourceCharacterRange"] as const) {
          const range = requireRecord(item[rangeKey], `Human Premise ${rangeKey}`);
          exactKeys(range, ["start", "end"]);
          const minimum = rangeKey === "sourceLineRange" ? 1 : 0;
          const start = requireInteger(range.start, `Human Premise ${rangeKey} start`, minimum);
          const end = requireInteger(range.end, `Human Premise ${rangeKey} end`, 1);
          if ((rangeKey === "sourceCharacterRange" && end <= start) || (rangeKey === "sourceLineRange" && end < start)) throw new Error(`Human Premise ${rangeKey} is invalid.`);
        }
      }
      const id = key === "storyIndex" ? String(item.sequence) : requireString(item.id, `Human Premise ${key} ID`);
      if (ids.has(id)) throw new Error(`Human Premise ${key} selection contains duplicates.`);
      ids.add(id);
    }
  }
  if (!Array.isArray(binding.structureInputs) || binding.structureInputs.length !== 3) throw new Error("Human Premise requires three structure inputs.");
  const roles = new Set<string>();
  for (const raw of binding.structureInputs) {
    const item = requireRecord(raw, "Human Premise structure input");
    exactKeys(item, ["role", "path", "sha256"]);
    if (!["project-bible", "chapter-map", "arc-atlas"].includes(String(item.role)) || roles.has(String(item.role))) {
      throw new Error("Human Premise structure roles must be unique and complete.");
    }
    roles.add(String(item.role));
    requireString(item.path, "Human Premise structure path");
    requireSha(item.sha256, "Human Premise structure SHA");
  }
}

function validateV4(packet: Record<string, unknown>): FireflyReviewPacketV4 {
  exactKeys(packet, ["schemaVersion", "packetId", "packetSha256", "generatedAt", "purpose", "source", "work", "artifact", "sourceBinding", "runtimeReceipt", "reviewerRuntimeReceipt", "candidates", "recommendation", "actions", "authority"]);
  if (!PACKET_ID.test(String(packet.packetId))) throw new Error("Review packet ID is invalid.");
  requireSha(packet.packetSha256, "Human Premise packet SHA");
  requireIso(packet.generatedAt, "Human Premise generatedAt");
  if (packet.purpose !== "human-premise") throw new Error("v4 packets must be Human Premise reviews.");
  const source = requireRecord(packet.source, "Human Premise source");
  exactKeys(source, ["system", "slateId", "sourceRevision"]);
  if (source.system !== "inkos") throw new Error("Human Premise source must be InkOS.");
  requireSafeId(source.slateId, "Human Premise slate ID");
  requireSha(source.sourceRevision, "Human Premise source revision");
  const work = requireRecord(packet.work, "Human Premise work");
  exactKeys(work, ["id", "title", "genre", "status"]);
  if (work.id !== source.slateId || work.genre !== "modern-fantasy-ko" || work.status !== "non-canonical") throw new Error("Human Premise work boundary is invalid.");
  requireString(work.title, "Human Premise work title");
  const artifact = requireRecord(packet.artifact, "Human Premise artifact");
  exactKeys(artifact, ["id", "kind", "title", "status"]);
  if (artifact.id !== source.slateId || artifact.kind !== "human-premise-slate" || artifact.status !== "human-decision-pending") throw new Error("Human Premise artifact boundary is invalid.");
  requireString(artifact.title, "Human Premise artifact title");
  validatePremiseSourceBinding(packet.sourceBinding);
  validatePremiseRuntime(packet.runtimeReceipt, "Human Premise generator runtime");
  validatePremiseRuntime(packet.reviewerRuntimeReceipt, "Human Premise reviewer runtime");
  if ((packet.runtimeReceipt as FireflyPitchRuntimeReceiptV4).model !== (packet.reviewerRuntimeReceipt as FireflyPitchRuntimeReceiptV4).model) {
    throw new Error("Human Premise generator and reviewer runtime models must match.");
  }
  if (!Array.isArray(packet.candidates) || packet.candidates.length < 1 || packet.candidates.length > 6) throw new Error("Human Premise review requires one to six candidates.");
  const sourceBinding = packet.sourceBinding as FireflyReviewPacketV4["sourceBinding"];
  const sourceSequences = new Set(sourceBinding.storyIndex.selected.map((item) => item.sequence));
  const styleIds = new Set(sourceBinding.styleExamples.selected.map((item) => item.id));
  const ids = new Set<string>();
  const survivors: string[] = [];
  for (const raw of packet.candidates) {
    const candidate = requireRecord(raw, "Human Premise candidate");
    exactKeys(candidate, ["id", "sha256", "titleCandidates", "oneLineHumanPromise", "humanPremise", "firstScene", "sourceBeatSequences", "styleExampleIds", "retainedReferenceTraits", "surfaceVariation", "independentReview"]);
    const id = requireString(candidate.id, "Human Premise candidate ID");
    if (!/^p\d{2}$/u.test(id) || ids.has(id)) throw new Error("Human Premise candidate IDs must be unique pNN values.");
    ids.add(id);
    const candidateSha = requireSha(candidate.sha256, "Human Premise candidate SHA");
    const unsigned = { ...candidate };
    delete unsigned.id;
    delete unsigned.sha256;
    delete unsigned.independentReview;
    if (canonicalSha256({ candidateId: id, ...unsigned }) !== candidateSha) throw new Error("Human Premise candidate SHA mismatch.");
    const titles = requireStrings(candidate.titleCandidates, "Human Premise titles");
    if (titles.length < 1 || titles.length > 3 || titles.some((title) => !title)) throw new Error("Human Premise requires one to three titles.");
    requireString(candidate.oneLineHumanPromise, "Human Premise promise");
    const premise = requireRecord(candidate.humanPremise, "Human Premise");
    const premiseKeys = ["protagonistAsPerson", "privateWant", "feltLack", "targetPerson", "whyToday", "firstChoice", "emotionalPayment", "stillHumanWithoutPower"];
    exactKeys(premise, premiseKeys);
    for (const key of premiseKeys) requireString(premise[key], `Human Premise ${key}`);
    const scene = requireRecord(candidate.firstScene, "Human Premise first scene");
    exactKeys(scene, ["currentSituation", "pressure", "action", "witnessedChange"]);
    for (const key of ["currentSituation", "pressure", "action", "witnessedChange"]) requireString(scene[key], `Human Premise scene ${key}`);
    if (!Array.isArray(candidate.sourceBeatSequences) || candidate.sourceBeatSequences.length < 1 || candidate.sourceBeatSequences.some((sequence) => !sourceSequences.has(Number(sequence)))) throw new Error("Human Premise candidate cites an unbound source beat.");
    const candidateStyleIds = requireStrings(candidate.styleExampleIds, "Human Premise style IDs");
    if (candidateStyleIds.length < 1 || candidateStyleIds.some((styleId) => !styleIds.has(styleId))) throw new Error("Human Premise candidate cites an unbound style example.");
    if (requireStrings(candidate.retainedReferenceTraits, "Human Premise retained traits").length < 2) throw new Error("Human Premise requires retained reference traits.");
    requireString(candidate.surfaceVariation, "Human Premise surface variation");
    const review = requireRecord(candidate.independentReview, "Human Premise independent review");
    exactKeys(review, ["candidateId", "verdict", "gates", "decisiveStrength", "decisiveRisk", "requiredRepair"]);
    if (review.candidateId !== id || !["SURVIVE", "HOLD", "KILL"].includes(String(review.verdict))) throw new Error("Human Premise review identity or verdict is invalid.");
    const gates = requireRecord(review.gates, "Human Premise gates");
    const gateKeys = ["humanDesire", "sourceGrounded", "sceneableToday", "nonMechanical", "voiceGrounded"];
    exactKeys(gates, gateKeys);
    if (gateKeys.some((key) => typeof gates[key] !== "boolean")) throw new Error("Human Premise gates must be boolean.");
    if (review.verdict === "SURVIVE" && gateKeys.some((key) => gates[key] !== true)) throw new Error("A failed Human Premise gate cannot SURVIVE.");
    for (const key of ["decisiveStrength", "decisiveRisk", "requiredRepair"]) requireString(review[key], `Human Premise review ${key}`);
    if (review.verdict === "SURVIVE") survivors.push(id);
  }
  const recommendation = packet.recommendation === null ? null : requireRecord(packet.recommendation, "Human Premise recommendation");
  if (recommendation) {
    exactKeys(recommendation, ["candidateId", "reason"]);
    if (!ids.has(requireString(recommendation.candidateId, "Human Premise recommendation ID"))) throw new Error("Human Premise recommendation candidate is absent.");
    requireString(recommendation.reason, "Human Premise recommendation reason");
  }
  if (survivors.length > 1 || (survivors[0] ?? null) !== (recommendation?.candidateId ?? null)) throw new Error("Human Premise recommendation must match the sole SURVIVE candidate.");
  if (JSON.stringify(packet.actions) !== JSON.stringify(["select", "hold", "reject"])) throw new Error("Human Premise actions are invalid.");
  const authority = requireRecord(packet.authority, "Human Premise authority");
  exactKeys(authority, ["canon", "decisionSurface", "decisionEffect", "commercialExpansion", "bookCreation", "manuscriptApply", "reverseSync"]);
  if (authority.canon !== "inkos" || authority.decisionSurface !== "storyyard" || authority.decisionEffect !== "human-premise-selection"
    || authority.commercialExpansion !== false || authority.bookCreation !== false || authority.manuscriptApply !== false || authority.reverseSync !== false) {
    throw new Error("Human Premise authority must stop at human selection.");
  }
  return packet as unknown as FireflyReviewPacketV4;
}

export function assertFireflyReviewPacketIdentity(packet: FireflyReviewPacket): void {
  const unsigned = { ...packet } as Record<string, unknown>;
  delete unsigned.schemaVersion;
  delete unsigned.packetId;
  delete unsigned.packetSha256;
  if (packet.schemaVersion === "firefly_review_packet/v1") delete unsigned.generatedAt;
  const actual = packet.schemaVersion === "firefly_review_packet/v5" ? variationReviewHash(unsigned) : packet.schemaVersion === "firefly_review_packet/v3" || packet.schemaVersion === "firefly_review_packet/v4"
    ? canonicalSha256(unsigned)
    : sha256(JSON.stringify(unsigned));
  if (actual !== packet.packetSha256 || packet.packetId !== `frp-${actual.slice(0, 24)}`) throw new Error("Review packet identity or SHA-256 mismatch.");
}

export function validateFireflyReviewPacket(value: unknown): FireflyReviewPacket {
  const packet = requireRecord(value, "review packet");
  const parsed = packet.schemaVersion === "firefly_review_packet/v5" ? validateVariationReviewPacketV5(packet) : packet.schemaVersion === "firefly_review_packet/v1"
    ? validateV1(packet)
    : packet.schemaVersion === "firefly_review_packet/v2"
      ? validateV2(packet)
      : packet.schemaVersion === "firefly_review_packet/v3"
        ? validateV3(packet)
      : packet.schemaVersion === "firefly_review_packet/v4"
        ? validateV4(packet)
      : (() => { throw new Error("Unsupported Firefly review packet schema."); })();
  assertFireflyReviewPacketIdentity(parsed);
  return parsed;
}

export function allSurfaceMatches(packet: FireflyReviewPacket): FireflySurfaceMatch[] {
  if (packet.schemaVersion !== "firefly_review_packet/v2") return [];
  return packet.candidates.flatMap((candidate) => candidate.review.surfaceComparison.surfaceMatches);
}
