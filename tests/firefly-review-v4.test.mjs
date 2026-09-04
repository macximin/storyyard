import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { validateFireflyDecisionIntent } from "../app/firefly-review-decision-intent.ts";
import { buildFireflyReviewPacketStaticIndex } from "../app/firefly-review-packet-index.mjs";

function canonicalSha256(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort) : item && typeof item === "object"
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sort(child)])) : item;
  return createHash("sha256").update(JSON.stringify(sort(value))).digest("hex");
}
const digest = (character) => character.repeat(64);
const runtime = {
  schemaVersion: "firefly_pitch_runtime/v1", provider: "codex-cli", model: "gpt-5.6-sol", reasoning: "high",
  soul: { mode: "canary-scoped", soulId: "male-modern-fantasy-ko", version: "v1", manifestSha256: digest("1"), promptSha256: digest("2"), resourceSha256: digest("3") },
};
const sourceBinding = {
  schemaVersion: "firefly_pitch_source_binding/v1", packId: "doksik-chaebol3-ko-v1", packSha256: digest("4"), sourceSha256: digest("5"),
  storyIndex: { path: "index", sha256: digest("6"), selected: [{ sequence: 1, arcId: "DCA-N01", sourceLineRange: { start: 1, end: 255 }, sourceCharacterRange: { start: 0, end: 6008 }, rawProseSha256: digest("7") }] },
  styleExamples: { path: "style", sha256: digest("8"), selected: [{ id: "phase-1-entry-1", sequence: 1, arcId: "DCA-N01", rawProseSha256: digest("7") }] },
  structureInputs: [{ role: "project-bible", path: "bible", sha256: digest("9") }, { role: "chapter-map", path: "chapters", sha256: digest("a") }, { role: "arc-atlas", path: "arcs", sha256: digest("b") }],
};

function candidate(id, verdict) {
  const content = {
    titleCandidates: ["할아버지가 내 이름을 다시 불렀다"], oneLineHumanPromise: "버림받은 손자가 마지막 가족의 믿음을 되찾기 위해 오늘 손을 내민다.",
    humanPremise: { protagonistAsPerson: "사랑받은 기억으로 실패한 세월을 버틴 손자", privateWant: "할아버지에게 끝까지 자기 편이라는 말을 듣고 싶다", feltLack: "누구에게도 믿음받지 못한 외로움", targetPerson: "할아버지", whyToday: "오늘 배신을 놓치면 가족을 다시 잃는다", firstChoice: "연회에서 거짓말을 직접 폭로한다", emotionalPayment: "할아버지가 처음으로 손자의 말을 믿는다", stillHumanWithoutPower: "재산이 없어도 마지막 가족에게 버려지고 싶지 않다" },
    firstScene: { currentSituation: "생일 연회가 깨지기 직전", pressure: "어린아이의 말을 아무도 믿지 않는다", action: "거짓말하는 어른을 직접 가리킨다", witnessedChange: "할아버지가 손자의 말을 끝까지 듣는다" },
    sourceBeatSequences: [1], styleExampleIds: ["phase-1-entry-1"], retainedReferenceTraits: ["가족 상실", "행동 뒤 즉시 지급"], surfaceVariation: "가문과 업종, 폭로 소품을 교체한다",
  };
  return { id, sha256: canonicalSha256({ candidateId: id, ...content }), ...content, independentReview: { candidateId: id, verdict, gates: { humanDesire: true, sourceGrounded: true, sceneableToday: true, nonMechanical: true, voiceGrounded: true }, decisiveStrength: "사람 욕망", decisiveRisk: "관계 상투성", requiredRepair: "상대 반응 구체화" } };
}

function packet() {
  const body = {
    generatedAt: "2026-09-04T00:00:00.000Z", purpose: "human-premise",
    source: { system: "inkos", slateId: "premise-canary", sourceRevision: digest("c") },
    work: { id: "premise-canary", title: "Human Premise HIL", genre: "modern-fantasy-ko", status: "non-canonical" },
    artifact: { id: "premise-canary", kind: "human-premise-slate", title: "Human Premise HIL", status: "human-decision-pending" },
    sourceBinding, runtimeReceipt: runtime, reviewerRuntimeReceipt: runtime,
    candidates: [candidate("p01", "SURVIVE"), candidate("p02", "HOLD")], recommendation: { candidateId: "p01", reason: "사람 욕망이 선명하다" }, actions: ["select", "hold", "reject"],
    authority: { canon: "inkos", decisionSurface: "storyyard", decisionEffect: "human-premise-selection", commercialExpansion: false, bookCreation: false, manuscriptApply: false, reverseSync: false },
  };
  const packetSha256 = canonicalSha256(body);
  return { schemaVersion: "firefly_review_packet/v4", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, ...body };
}

test("accepts source-bound Human Premise HIL and keeps expansion disabled", () => {
  const parsed = validateFireflyReviewPacket(packet());
  assert.equal(parsed.schemaVersion, "firefly_review_packet/v4");
  assert.equal(parsed.authority.commercialExpansion, false);
  assert.equal(buildFireflyReviewPacketStaticIndex([parsed]).packets[0].purpose, "human-premise");
  const selected = parsed.candidates[0];
  assert.equal(validateFireflyDecisionIntent(parsed, { decision: "select", candidateId: selected.id, candidateSha256: selected.sha256 }).ok, true);
});

test("rejects runtime drift, unbound evidence, and failed-gate survivors", () => {
  const runtimeDrift = packet(); runtimeDrift.runtimeReceipt.model = "gpt-5.6-terra";
  assert.throws(() => validateFireflyReviewPacket(runtimeDrift), /sol\/high runtime/);
  runtimeDrift.runtimeReceipt.model = "gpt-5.6-sol";
  const unbound = packet(); unbound.candidates[0].sourceBeatSequences = [2];
  const { id, sha256: _sha, independentReview: _review, ...unsigned } = unbound.candidates[0];
  unbound.candidates[0].sha256 = canonicalSha256({ candidateId: id, ...unsigned });
  assert.throws(() => validateFireflyReviewPacket(unbound), /unbound source beat/);
  const failed = packet(); failed.candidates[0].independentReview.gates.nonMechanical = false;
  assert.throws(() => validateFireflyReviewPacket(failed), /cannot SURVIVE/);
});

test("active review queue hides invalidated slates and exposes the v2 Human Premise canary", () => {
  const index = JSON.parse(readFileSync(new URL("../data/firefly/review-packets/index.json", import.meta.url), "utf8"));
  const invalidations = JSON.parse(readFileSync(new URL("../data/firefly/review-packets/invalidations.json", import.meta.url), "utf8"));
  const invalidatedIds = new Set(invalidations.invalidations.map((item) => item.packetId));
  const active = index.packets.filter((item) => !invalidatedIds.has(item.packetId));
  assert.equal(active.some((item) => item.packetId === "frp-984253c92d9b3bd1fb06c976"), false);
  assert.equal(active.some((item) => item.packetId === "frp-5f7d2056b4d39c9a8d2c8f88"), false);
  const canary = active.find((item) => item.packetId === "frp-326a79098a01aabd990f4abb");
  assert.equal(canary?.schemaVersion, "firefly_review_packet/v4");
  assert.equal(canary?.source.slateId, "chaebol-human-premise-20260904-v2");
  assert.equal(canary?.authority.commercialExpansion, false);
  assert.equal(canary?.authority.bookCreation, false);
});
