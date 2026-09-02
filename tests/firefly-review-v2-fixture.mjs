import { createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
const iso = "2026-08-28T06:00:00.000Z";

function span(body, text) {
  const characterStart = body.indexOf(text);
  const startByte = Buffer.byteLength(body.slice(0, characterStart));
  const endByte = startByte + Buffer.byteLength(text);
  return { coordinateKind: "utf8-byte", startByte, endByte, sliceSha256: hash(text) };
}

function candidate(id, body, receiptSeed, withMatch) {
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
    applicationBindingSha256: hash(`application-${receiptSeed}-${id}`),
    status: "unreviewed",
    body,
    sha256: candidateSha256,
    preparedAt: iso,
    commercialScore: 88,
    commercialEvaluation: {
      openingPressure: 90, protagonistAgency: 88, resistanceQuality: 86, visiblePayoff: 89,
      endingPropulsion: 91, referenceEngineRetention: 85, transformationIntegrity: 87, styleFidelity: 86,
    },
    commercialEvaluationReceiptSha256: hash(`commercial-${receiptSeed}-${id}`),
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
        soulId: "male-modern-fantasy-ko",
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
  genre = "현대판타지",
  round = 1,
  pairId = `pair-${round}`,
} = {}) {
  const receiptSeed = `${bookId}-${round}-${pairId}`;
  const currentContent = `현재 원고 ${receiptSeed}`;
  const body = {
    source: { system: "inkos", bookId, sourceRevision: `revision-${receiptSeed}` },
    work: { id: bookId, title, genre, status: "active", targetChapters: 200 },
    artifact: { id: "chapter-0001", kind: "chapter", chapterNumber: 1, title: "첫 화", status: "ready-for-review", currentContent, currentContentSha256: hash(currentContent) },
    comparison: {
      reviewKind: "independent-blind-comparison", pairId, round,
      blindRunId: `blind-run-${receiptSeed}`, blindSessionId: `blind-session-${receiptSeed}`,
      commonInputReceiptSha256: hash(`common-${receiptSeed}`), pairedGenerationReceiptSha256: hash(`paired-${receiptSeed}`),
      labelAssignmentReceiptSha256: hash(`labels-${receiptSeed}`), runtimeReceiptSha256: hash(`runtime-${receiptSeed}`),
      candidateLabelsShuffled: true, generatorMetadataExcluded: true,
      runtime: { kernel: "enforce", piWorker: "off", retrieval: "legacy", fts: "off", model: "gpt-5.6-sol", reasoning: "high" },
    },
    candidates: [
      candidate("candidate-A", `첫 후보의 압박 장면 ${receiptSeed}`, receiptSeed, true),
      candidate("candidate-B", `둘째 후보의 압박 장면 ${receiptSeed}`, receiptSeed, false),
    ],
    sealedGenerationEvidence: {
      candidateEvidenceReceiptSha256s: [hash(`candidate-1-${receiptSeed}`), hash(`candidate-2-${receiptSeed}`)].sort(),
      contentNeutralReceiptSha256s: [hash(`neutral-1-${receiptSeed}`), hash(`neutral-2-${receiptSeed}`)].sort(),
    },
    recommendation: null,
    actions: ["approve", "polish", "hold", "reject"],
    authority: { canon: "inkos", decisionSurface: "storyyard", apply: "inkos", reverseSync: false },
  };
  const packetSha256 = hash(JSON.stringify(body));
  return { schemaVersion: "firefly_review_packet/v2", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, generatedAt: iso, ...body };
}
