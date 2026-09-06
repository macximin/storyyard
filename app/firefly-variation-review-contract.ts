import { createHash } from "node:crypto";

type VariationCheck = { passed: boolean; evidence: string };
export type FireflyVariationReviewCandidateV5 = {
  id: string; title: string; markdown: string; sha256: string; preparedAt: string; sourceEventIds: string[];
  independentReview: {
    verdict: "ready" | "revise" | "reject";
    sourceAccuracy: VariationCheck; selfInterest: VariationCheck; causalCoherence: VariationCheck; variationQuality: VariationCheck;
    readingPleasure: { assessment: string; evidence: string }; requiredRepair: string;
  };
};
export type FireflyVariationReviewPacketV5 = {
  schemaVersion: "firefly_review_packet/v5"; packetId: string; packetSha256: string; generatedAt: string;
  purpose: "planning-variation";
  source: { system: "inkos"; slateId: string; sourceRevision: string };
  work: { id: string; title: string; genre: string; status: "non-canonical"; targetChapters: number };
  artifact: { id: string; kind: "pitch-variation-slate"; title: string; status: "human-decision-pending" };
  baseline: { slateId: string; candidateId: string; candidateSha256: string; planSha256: string; title: string };
  scope: { episodeStart: 1; episodeEnd: 4; through: string };
  candidates: FireflyVariationReviewCandidateV5[];
  recommendation: { candidateId: string; reason: string } | null;
  actions: ["select", "hold", "reject"];
  authority: { canon: "inkos"; decisionSurface: "storyyard"; decisionEffect: "variation-selection"; bookCreation: false; manuscriptApply: false; reverseSync: false };
};

// Mirrors InkOS planning/pitch-variation.ts. This version hashes the complete
// candidate, including independent review, using code-unit sorted JSON keys.
export function variationReviewHash(value: unknown): string {
  const canonical = (item: unknown): string => Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
    : item && typeof item === "object" ? `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical((item as Record<string, unknown>)[key])}`).join(",")}}`
      : JSON.stringify(item);
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) throw new Error(`${label} has missing or unknown fields.`);
  return result;
}
function text(value: unknown, label: string, min = 1, max = Infinity): string {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new Error(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
function pattern(value: unknown, regex: RegExp, label: string): string {
  if (typeof value !== "string" || !regex.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}
const id = (value: unknown) => pattern(value, /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u, "Variation identifier");
const variantId = (value: unknown) => pattern(value, /^v\d{2}$/u, "Variation candidate ID");
const sha = (value: unknown) => pattern(value, /^[a-f0-9]{64}$/u, "Variation SHA");
function date(value: unknown): string {
  const result = pattern(value, /^\d{4}-(?:0[1-9]|1[0-2])-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/u, "Variation timestamp");
  const year = Number(result.slice(0, 4));
  const month = Number(result.slice(5, 7));
  const day = Number(result.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthDays[month - 1]) throw new Error("Variation timestamp is invalid.");
  return result;
}
function check(value: unknown): VariationCheck {
  const item = record(value, ["passed", "evidence"], "Variation check");
  if (typeof item.passed !== "boolean") throw new Error("Variation check passed must be boolean.");
  return { passed: item.passed, evidence: text(item.evidence, "Variation check evidence") };
}
function candidate(value: unknown): FireflyVariationReviewCandidateV5 {
  const item = record(value, ["id", "title", "markdown", "sha256", "preparedAt", "sourceEventIds", "independentReview"], "Variation candidate");
  const review = record(item.independentReview, ["verdict", "sourceAccuracy", "selfInterest", "causalCoherence", "variationQuality", "readingPleasure", "requiredRepair"], "Variation review");
  if (!["ready", "revise", "reject"].includes(String(review.verdict))) throw new Error("Variation verdict is invalid.");
  const pleasure = record(review.readingPleasure, ["assessment", "evidence"], "Variation reading pleasure");
  if (!Array.isArray(item.sourceEventIds) || item.sourceEventIds.length < 2 || item.sourceEventIds.length > 8) throw new Error("Variation candidate requires two to eight source IDs.");
  const parsed: FireflyVariationReviewCandidateV5 = {
    id: variantId(item.id), title: text(item.title, "Variation title"), markdown: text(item.markdown, "Variation Markdown", 600, 35_000),
    sha256: sha(item.sha256), preparedAt: date(item.preparedAt), sourceEventIds: item.sourceEventIds.map(id),
    independentReview: {
      verdict: review.verdict as FireflyVariationReviewCandidateV5["independentReview"]["verdict"],
      sourceAccuracy: check(review.sourceAccuracy), selfInterest: check(review.selfInterest), causalCoherence: check(review.causalCoherence), variationQuality: check(review.variationQuality),
      readingPleasure: { assessment: text(pleasure.assessment, "Variation reading assessment"), evidence: text(pleasure.evidence, "Variation reading evidence") },
      requiredRepair: text(review.requiredRepair, "Variation required repair"),
    },
  };
  const { independentReview } = parsed;
  if (independentReview.verdict === "ready" && [independentReview.sourceAccuracy, independentReview.selfInterest, independentReview.causalCoherence, independentReview.variationQuality].some((item) => !item.passed)) throw new Error("Failed checks cannot receive a ready verdict.");
  const { sha256, ...unsigned } = parsed;
  if (variationReviewHash(unsigned) !== sha256) throw new Error("Variation candidate SHA mismatch.");
  return parsed;
}

export function validateVariationReviewPacketV5(value: unknown): FireflyVariationReviewPacketV5 {
  const packet = record(value, ["schemaVersion", "packetId", "packetSha256", "generatedAt", "purpose", "source", "work", "artifact", "baseline", "scope", "candidates", "recommendation", "actions", "authority"], "Variation packet");
  if (packet.schemaVersion !== "firefly_review_packet/v5" || packet.purpose !== "planning-variation") throw new Error("Variation packet purpose is invalid.");
  const source = record(packet.source, ["system", "slateId", "sourceRevision"], "Variation source");
  const work = record(packet.work, ["id", "title", "genre", "status", "targetChapters"], "Variation work");
  const artifact = record(packet.artifact, ["id", "kind", "title", "status"], "Variation artifact");
  const baseline = record(packet.baseline, ["slateId", "candidateId", "candidateSha256", "planSha256", "title"], "Variation baseline");
  const scope = record(packet.scope, ["episodeStart", "episodeEnd", "through"], "Variation scope");
  const authority = record(packet.authority, ["canon", "decisionSurface", "decisionEffect", "bookCreation", "manuscriptApply", "reverseSync"], "Variation authority");
  if (source.system !== "inkos" || work.status !== "non-canonical" || artifact.kind !== "pitch-variation-slate" || artifact.status !== "human-decision-pending") throw new Error("Variation non-canonical boundary is invalid.");
  if (!Number.isInteger(work.targetChapters) || (work.targetChapters as number) <= 0) throw new Error("Variation targetChapters must be a positive integer.");
  if (scope.episodeStart !== 1 || scope.episodeEnd !== 4) throw new Error("Variation scope must be episodes 1 through 4.");
  if (authority.canon !== "inkos" || authority.decisionSurface !== "storyyard" || authority.decisionEffect !== "variation-selection" || authority.bookCreation !== false || authority.manuscriptApply !== false || authority.reverseSync !== false) throw new Error("Variation authority cannot promote a plan, Book, or manuscript.");
  if (JSON.stringify(packet.actions) !== JSON.stringify(["select", "hold", "reject"])) throw new Error("Variation actions are invalid.");
  if (!Array.isArray(packet.candidates) || packet.candidates.length < 2 || packet.candidates.length > 3) throw new Error("Variation packet requires two or three candidates.");
  const candidates = packet.candidates.map(candidate);
  const recommendation = packet.recommendation === null ? null : record(packet.recommendation, ["candidateId", "reason"], "Variation recommendation");
  const parsed: FireflyVariationReviewPacketV5 = {
    schemaVersion: "firefly_review_packet/v5", packetId: pattern(packet.packetId, /^frp-[a-f0-9]{24}$/u, "Variation packet ID"), packetSha256: sha(packet.packetSha256), generatedAt: date(packet.generatedAt), purpose: "planning-variation",
    source: { system: "inkos", slateId: id(source.slateId), sourceRevision: sha(source.sourceRevision) },
    work: { id: id(work.id), title: text(work.title, "Variation work title"), genre: text(work.genre, "Variation genre"), status: "non-canonical", targetChapters: work.targetChapters as number },
    artifact: { id: id(artifact.id), kind: "pitch-variation-slate", title: text(artifact.title, "Variation artifact title"), status: "human-decision-pending" },
    baseline: { slateId: id(baseline.slateId), candidateId: text(baseline.candidateId, "Variation baseline candidate"), candidateSha256: sha(baseline.candidateSha256), planSha256: sha(baseline.planSha256), title: text(baseline.title, "Variation baseline title") },
    scope: { episodeStart: 1, episodeEnd: 4, through: text(scope.through, "Variation scope end") }, candidates,
    recommendation: recommendation ? { candidateId: variantId(recommendation.candidateId), reason: text(recommendation.reason, "Variation recommendation reason") } : null,
    actions: ["select", "hold", "reject"], authority: { canon: "inkos", decisionSurface: "storyyard", decisionEffect: "variation-selection", bookCreation: false, manuscriptApply: false, reverseSync: false },
  };
  if (parsed.work.id !== parsed.source.slateId || parsed.artifact.id !== parsed.source.slateId) throw new Error("Variation slate identity mismatch.");
  if (new Set(candidates.map((item) => item.id)).size !== candidates.length) throw new Error("Duplicate variation candidates.");
  if (parsed.recommendation && !candidates.some((item) => item.id === parsed.recommendation?.candidateId && item.independentReview.verdict === "ready")) throw new Error("Recommended variation must be ready.");
  const { schemaVersion: _version, packetId, packetSha256, ...unsigned } = parsed;
  const actual = variationReviewHash(unsigned);
  if (packetSha256 !== actual || packetId !== `frp-${actual.slice(0, 24)}`) throw new Error("Variation packet identity mismatch.");
  return parsed;
}
