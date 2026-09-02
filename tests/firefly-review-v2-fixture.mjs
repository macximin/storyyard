import { createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonicalHash = (value) => {
  const sort = (item) => Array.isArray(item) ? item.map(sort)
    : item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sort(child)]))
      : item;
  return hash(JSON.stringify(sort(value)));
};
const iso = "2026-08-28T06:00:00.000Z";

function span(body, text) {
  const characterStart = body.indexOf(text);
  const startByte = Buffer.byteLength(body.slice(0, characterStart));
  const endByte = startByte + Buffer.byteLength(text);
  return { coordinateKind: "utf8-byte", startByte, endByte, sliceSha256: hash(text) };
}

function candidate(id, body, receiptSeed, withMatch, canaryIsolation, soulId) {
  const candidateSha256 = hash(body);
  const selected = span(body, "압박");
  const candidateSelector = {
    coordinateKind: "utf8-byte",
    candidateContentSha256: candidateSha256,
    startByte: selected.startByte,
    endByte: selected.endByte,
    candidateSliceSha256: selected.sliceSha256,
  };
  const sourceSelector = {
    coordinateKind: "utf8-byte",
    sourceId: `gdrive-source-${receiptSeed}-${id}`,
    sourceSha256: hash(`source-${receiptSeed}-${id}`),
    startByte: 0,
    endByte: Buffer.byteLength("원문 압박"),
    sliceSha256: hash("원문 압박"),
  };
  const selectorBody = {
    provenanceBridgeReceiptSha256: hash(`bridge-${receiptSeed}-${id}`),
    matchMethod: "exact-token-12",
    candidate: candidateSelector,
    source: sourceSelector,
  };
  const selectorSha256 = hash(JSON.stringify(selectorBody));
  return {
    id,
    kind: "blind-pair-candidate",
    evaluationBindingSha256: hash(`evaluation-${receiptSeed}-${id}`),
    canaryIsolation: { ...canaryIsolation },
    status: "unreviewed",
    body,
    sha256: candidateSha256,
    preparedAt: iso,
    commercialScore: 88,
    commercialEvaluation: {
      openingPressure: 90, protagonistAgency: 88, resistanceQuality: 86, visiblePayoff: 89,
      endingPropulsion: 91, referenceEngineRetention: 85, transformationIntegrity: 87, styleFidelity: 86,
    },
    commercialEvaluationReceiptSha256: hash(`runtime-${receiptSeed}`),
    review: {
      status: "unreviewed",
      retained: ["engine"],
      variedSurface: ["people"],
      linkedConsequences: ["money"],
      emotionalCoherence: { score: 87, evidence: [selected] },
      contentNeutrality: { passed: true, violations: [] },
      canonContradictions: [],
      surfaceComparison: {
        schemaVersion: "soul_corpus_comparison/v2",
        soulId,
        soulVersion: "v1",
        surfaceIndexSha256: hash(`surface-index-${receiptSeed}`),
        surfaceMatches: withMatch ? [{
          matchId: `fsm-${selectorSha256.slice(0, 24)}`,
          selectorSha256,
          ...selectorBody,
          classification: "pending",
        }] : [],
        similarityPenaltyApplied: false,
        automaticRewriteApplied: false,
        automaticRejectApplied: false,
        humanDecision: "pending",
      },
    },
  };
}

export function makeFireflyReviewPacketV2({
  bookId = "blind-book",
  title = "블라인드 작품",
  genre = "modern-fantasy-ko",
  round = 1,
  pairId = `bp-${hash(`${bookId}:${round}:pair`).slice(0, 24)}`,
} = {}) {
  const receiptSeed = `${bookId}-${round}-${pairId}`;
  const soulId = ({
    "modern-fantasy-ko": "male-modern-fantasy-ko",
    "fantasy-ko": "male-fantasy-ko",
    "murim-ko": "male-murim-ko",
  })[genre] ?? "male-modern-fantasy-ko";
  const currentContent = `현재 원고 ${receiptSeed}`;
  const canaryIsolation = {
    receiptSha256: hash(`canary-receipt-${receiptSeed}`),
    receiptSelfHash: hash(`canary-self-${receiptSeed}`),
    isolationScopeSha256: hash(`canary-scope-${receiptSeed}`),
    commonSnapshotSha256: hash(`common-snapshot-${receiptSeed}`),
  };
  const candidates = [
    candidate("candidate-A", `첫 후보의 압박 장면 ${receiptSeed}`, receiptSeed, true, canaryIsolation, soulId),
    candidate("candidate-B", `둘째 후보의 압박 장면 ${receiptSeed}`, receiptSeed, false, canaryIsolation, soulId),
  ];
  const body = {
    purpose: "promotion-evaluation",
    source: { system: "inkos", bookId, sourceRevision: `revision-${receiptSeed}` },
    work: { id: bookId, title, genre, status: "active", targetChapters: 200 },
    artifact: { id: "chapter-0001", kind: "chapter", chapterNumber: 1, title: "첫 화", status: "ready-for-review", currentContent, currentContentSha256: hash(currentContent) },
    comparison: {
      reviewKind: "independent-blind-comparison", pairId, round,
      blindRunId: `br-${hash(`run-${receiptSeed}`).slice(0, 24)}`, blindSessionId: `br-${hash(`session-${receiptSeed}`).slice(0, 24)}`,
      commonInputReceiptSha256: hash(`common-${receiptSeed}`), pairedGenerationReceiptSha256: hash(`paired-${receiptSeed}`),
      labelAssignmentReceiptSha256: hash(`labels-${receiptSeed}`), runtimeReceiptSha256: hash(`runtime-${receiptSeed}`),
      canaryIsolation: { ...canaryIsolation },
      candidateLabelsShuffled: true, generatorMetadataExcluded: true,
      runtime: { kernel: "enforce", piWorker: "off", retrieval: "legacy", fts: "off", model: "gpt-5.6-sol", reasoning: "high" },
    },
    candidates,
    sealedGenerationEvidence: {
      candidateEvidenceReceiptSha256s: [hash(`candidate-1-${receiptSeed}`), hash(`candidate-2-${receiptSeed}`)].sort(),
      contentNeutralReceiptSha256s: candidates.map((item) => canonicalHash({
        schemaVersion: "firefly-content-neutral-evaluation/v1",
        candidateId: item.id,
        candidateSha256: item.sha256,
        contentNeutrality: item.review.contentNeutrality,
      })).sort(),
    },
    recommendation: null,
    actions: ["select", "tie", "invalid"],
    authority: { canon: "inkos", decisionSurface: "storyyard", decisionEffect: "advisory", manuscriptApply: false, reverseSync: false },
  };
  const packetSha256 = hash(JSON.stringify({ generatedAt: iso, ...body }));
  return { schemaVersion: "firefly_review_packet/v2", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, generatedAt: iso, ...body };
}
