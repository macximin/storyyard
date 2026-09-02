import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { allSurfaceMatches, validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const iso = "2026-08-28T06:00:00.000Z";

function span(body, text) {
  const characterStart = body.indexOf(text);
  const startByte = Buffer.byteLength(body.slice(0, characterStart));
  const endByte = startByte + Buffer.byteLength(text);
  return { coordinateKind: "utf8-byte", startByte, endByte, sliceSha256: hash(text) };
}

function candidate(id, body, withMatch, canaryIsolation) {
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
    sourceId: `gdrive-source-${id}`,
    sourceSha256: hash(`source-${id}`),
    startByte: 0,
    endByte: Buffer.byteLength("원문 압박"),
    sliceSha256: hash("원문 압박"),
  };
  const selectorBody = {
    provenanceBridgeReceiptSha256: hash(`bridge-${id}`),
    matchMethod: "exact-token-12",
    candidate: candidateSelector,
    source: sourceSelector,
  };
  const selectorSha256 = hash(JSON.stringify(selectorBody));
  const surfaceMatches = withMatch ? [{
    matchId: `fsm-${selectorSha256.slice(0, 24)}`,
    selectorSha256,
    ...selectorBody,
    classification: "pending",
  }] : [];
  return {
    id,
    kind: "blind-pair-candidate",
    evaluationBindingSha256: hash(`evaluation-${id}`),
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
    commercialEvaluationReceiptSha256: hash(`commercial-${id}`),
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
        surfaceIndexSha256: hash("surface-index"),
        surfaceMatches,
        similarityPenaltyApplied: false,
        automaticRewriteApplied: false,
        automaticRejectApplied: false,
        humanDecision: "pending",
      },
    },
  };
}

function packet() {
  const currentContent = "현재 원고";
  const canaryIsolation = {
    receiptSha256: hash("canary-receipt"), receiptSelfHash: hash("canary-self"),
    isolationScopeSha256: hash("canary-scope"), commonSnapshotSha256: hash("common-snapshot"),
  };
  const body = {
    purpose: "promotion-evaluation",
    source: { system: "inkos", bookId: "blind-book", sourceRevision: "revision-one" },
    work: { id: "blind-book", title: "블라인드 작품", genre: "현대판타지", status: "active", targetChapters: 200 },
    artifact: { id: "chapter-0001", kind: "chapter", chapterNumber: 1, title: "첫 화", status: "ready-for-review", currentContent, currentContentSha256: hash(currentContent) },
    comparison: {
      reviewKind: "independent-blind-comparison", pairId: "pair-one", round: 1,
      blindRunId: "blind-run-one", blindSessionId: "blind-session-one",
      commonInputReceiptSha256: hash("common"), pairedGenerationReceiptSha256: hash("paired"),
      labelAssignmentReceiptSha256: hash("labels"), runtimeReceiptSha256: hash("runtime"),
      canaryIsolation: { ...canaryIsolation },
      candidateLabelsShuffled: true, generatorMetadataExcluded: true,
      runtime: { kernel: "enforce", piWorker: "off", retrieval: "legacy", fts: "off", model: "gpt-5.6-sol", reasoning: "high" },
    },
    candidates: [candidate("candidate-A", "첫 후보의 압박 장면", true, canaryIsolation), candidate("candidate-B", "둘째 후보의 압박 장면", false, canaryIsolation)],
    sealedGenerationEvidence: {
      candidateEvidenceReceiptSha256s: [hash("candidate-1"), hash("candidate-2")].sort(),
      contentNeutralReceiptSha256s: [hash("neutral-1"), hash("neutral-2")].sort(),
    },
    recommendation: null,
    actions: ["select", "tie", "invalid"],
    authority: { canon: "inkos", decisionSurface: "storyyard", decisionEffect: "advisory", manuscriptApply: false, reverseSync: false },
  };
  const packetSha256 = hash(JSON.stringify({ generatedAt: iso, ...body }));
  return { schemaVersion: "firefly_review_packet/v2", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, generatedAt: iso, ...body };
}

function rehash(value) {
  const { schemaVersion: _schemaVersion, packetId: _packetId, packetSha256: _packetSha256, generatedAt, ...body } = value;
  const packetSha256 = hash(JSON.stringify({ generatedAt, ...body }));
  return { schemaVersion: "firefly_review_packet/v2", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, generatedAt, ...body };
}

test("accepts a strict blind v2 packet without raw source prose", () => {
  const value = packet();
  const parsed = validateFireflyReviewPacket(value);
  assert.equal(parsed.schemaVersion, "firefly_review_packet/v2");
  assert.equal(parsed.purpose, "promotion-evaluation");
  assert.equal(parsed.authority.decisionEffect, "advisory");
  assert.equal(parsed.authority.manuscriptApply, false);
  assert.deepEqual(parsed.actions, ["select", "tie", "invalid"]);
  assert.equal(allSurfaceMatches(parsed).length, 1);
  assert.equal(JSON.stringify(parsed).includes("원문 압박"), false);
});

test("rejects candidate drift, automatic rewrite, and raw selector fields", () => {
  const base = packet();
  const changedCandidate = structuredClone(base);
  changedCandidate.candidates[0].body += "변경";
  assert.throws(() => validateFireflyReviewPacket(changedCandidate), /candidate SHA mismatch/u);

  const automatic = structuredClone(base);
  automatic.candidates[0].review.surfaceComparison.automaticRewriteApplied = true;
  assert.throws(() => validateFireflyReviewPacket(automatic), /automatically/u);

  const leaked = structuredClone(base);
  leaked.candidates[0].review.surfaceComparison.surfaceMatches[0].source.rawText = "원문 압박";
  assert.throws(() => validateFireflyReviewPacket(leaked), /unknown field rawText/u);
});

test("binds generatedAt and rejects lane, internal path, or label-map leakage", () => {
  const base = packet();
  assert.throws(
    () => validateFireflyReviewPacket({ ...base, generatedAt: "2026-08-28T06:00:01.000Z" }),
    /identity or SHA-256 mismatch/u,
  );
  for (const [field, value] of [
    ["lane", "genre-soul"],
    ["internalPath", ".inkos/canaries/pair-one/soul"],
    ["labelMap", { "candidate-A": "genre-soul" }],
  ]) {
    const leaked = structuredClone(base);
    leaked.comparison[field] = value;
    assert.throws(() => validateFireflyReviewPacket(leaked), new RegExp(`unknown field ${field}`, "u"));
  }
});

test("requires blind candidate kind, matching canary scope, and non-applying authority", () => {
  const base = packet();
  const wrongKind = structuredClone(base);
  wrongKind.candidates[0].kind = "reference-transformation-candidate";
  assert.throws(() => validateFireflyReviewPacket(wrongKind), /blind-pair candidate kind/u);

  const wrongScope = structuredClone(base);
  wrongScope.candidates[0].canaryIsolation.isolationScopeSha256 = "0".repeat(64);
  assert.throws(() => validateFireflyReviewPacket(wrongScope), /does not match/u);

  const applying = structuredClone(base);
  applying.authority.manuscriptApply = true;
  assert.throws(() => validateFireflyReviewPacket(applying), /non-applying/u);

  const wrongLabels = structuredClone(base);
  wrongLabels.candidates[0].id = "candidate-C";
  assert.throws(() => validateFireflyReviewPacket(wrongLabels), /candidate-A then candidate-B/u);

  const stringRound = structuredClone(base);
  stringRound.comparison.round = "1";
  assert.throws(() => validateFireflyReviewPacket(stringRound), /number 1, 2, or 3/u);

  const crossBook = structuredClone(base);
  crossBook.source.bookId = "another-book";
  assert.throws(() => validateFireflyReviewPacket(rehash(crossBook)), /source Book ID differs/u);
});
