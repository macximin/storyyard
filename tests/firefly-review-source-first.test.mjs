import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { validateFireflyDecisionIntent } from "../app/firefly-review-decision-intent.ts";

const fixtureBytes = await readFile(new URL("./fixtures/inkos-source-first-pitch-review-v3.json", import.meta.url), "utf8");
const fixture = () => JSON.parse(fixtureBytes);
const producerPath = process.env.INKOS_SOURCE_FIRST_REVIEW_FIXTURE
  ?? new URL("../../inkos/packages/core/src/__tests__/fixtures/source-first-pitch-review-v3.json", import.meta.url);

function canonicalSha256(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sort(child)])) : item;
  return createHash("sha256").update(JSON.stringify(sort(value))).digest("hex");
}

function reseal(packet) {
  for (const candidate of packet.candidates) {
    const unsigned = { ...candidate }; delete unsigned.sha256;
    candidate.sha256 = canonicalSha256(unsigned);
  }
  const unsigned = { ...packet }; delete unsigned.schemaVersion; delete unsigned.packetId; delete unsigned.packetSha256;
  packet.packetSha256 = canonicalSha256(unsigned);
  packet.packetId = `frp-${packet.packetSha256.slice(0, 24)}`;
  return packet;
}

test("reads the same packet emitted by InkOS, retaining the complete project plan and explicit absences", () => {
  const packet = validateFireflyReviewPacket(fixture());
  const candidate = packet.candidates[0];
  assert.equal(candidate.sourcePremise, undefined);
  assert.equal(candidate.spineRetention.schemaVersion, "firefly_spine_retention/v2");
  assert.deepEqual(candidate.railB, []);
  assert.equal(candidate.spineRetention.relationshipConversion, null);
  assert.equal(candidate.spineRetention.rewards[0].witness, null);
  assert.ok(candidate.arcLadder.every((item) => item.relationshipConversion === null));
  assert.equal(candidate.projectPlan.markdown, fixture().candidates[0].projectPlan.markdown);
  for (let section = 1; section <= 9; section++) assert.match(candidate.projectPlan.markdown, new RegExp(`^## ${section}\\.`, "m"));
  assert.equal(validateFireflyDecisionIntent(packet, { decision: "select", candidateId: candidate.id, candidateSha256: candidate.sha256 }).ok, true);
  assert.equal(packet.authority.manuscriptApply, false);
});

test("matches the actual producer fixture byte for byte and validates it directly", {
  skip: !process.env.INKOS_SOURCE_FIRST_REVIEW_FIXTURE && !existsSync(producerPath) ? "Independent receiver checkout; provide INKOS_SOURCE_FIRST_REVIEW_FIXTURE for the producer integration check." : false,
}, async () => {
  const producerBytes = await readFile(producerPath, "utf8");
  assert.equal(producerBytes, fixtureBytes);
  assert.equal(validateFireflyReviewPacket(JSON.parse(producerBytes)).packetSha256, fixture().packetSha256);
});

test("rejects unsupported premise/evidence combinations and source-first plans on legacy candidates", () => {
  const premise = { slateId: "legacy-premise", candidateId: "p01", candidateSha256: "a".repeat(64), privateWant: "실제 과거 전제", firstChoice: "실제 과거 선택", emotionalPayment: "실제 과거 보상" };
  for (const edit of [
    (candidate) => { candidate.sourcePremise = premise; },
    (candidate) => { candidate.sourcePremise = premise; delete candidate.spineRetention; },
    (candidate) => { delete candidate.spineRetention; },
  ]) {
    const packet = fixture(); edit(packet.candidates[0]);
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /combination|requires source-first/);
  }
});

test("does not confuse null with missing or blank source-first evidence", () => {
  const mutations = [
    [(candidate) => { delete candidate.arcLadder[0].relationshipConversion; }, /relationshipConversion/],
    [(candidate) => { candidate.arcLadder[0].relationshipConversion = "   "; }, /must not be blank/],
    [(candidate) => { candidate.railB = ["   "]; }, /railB/],
    [(candidate) => { delete candidate.spineRetention.relationshipConversion; }, /relationshipConversion/],
    [(candidate) => { delete candidate.spineRetention.rewards[0].witness; }, /witness/],
    [(candidate) => { candidate.spineRetention.rewards[0].witness = "   "; }, /must not be blank/],
    [(candidate) => { candidate.spineRetention.sourceReconstruction.personalGoal = "   "; }, /must not be blank/],
    [(candidate) => { candidate.spineRetention.decisionComparisons[0].sourceSequenceStart = 5; }, /sequence range/],
    [(candidate) => { candidate.spineRetention.payoffPair = {}; }, /unknown field payoffPair/],
    [(candidate) => { delete candidate.projectPlan; }, /project plan/],
    [(candidate) => { candidate.projectPlan.markdown = "제목만 있는 불완전 기획"; }, /600 to 30000/],
    [(candidate) => { candidate.projectPlan.format = "unsupported"; }, /format/],
    [(candidate) => { delete candidate.independentReview.sourceChecks; }, /independent checks/],
    [(candidate) => { candidate.independentReview.sourceChecks.selfInterest.evidence = "   "; }, /must not be blank/],
  ];
  for (const [edit, expected] of mutations) {
    const packet = fixture(); edit(packet.candidates[0]);
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), expected);
  }
});

test("retains candidate hashes and artifact/slate identity boundaries", () => {
  const tampered = fixture();
  tampered.candidates[0].projectPlan.markdown += "\n변조된 내용";
  assert.throws(() => validateFireflyReviewPacket(tampered), /candidate SHA/);
  const mismatched = fixture(); mismatched.artifact.id = "another-slate";
  assert.throws(() => validateFireflyReviewPacket(reseal(mismatched)), /artifact ID differs/);
});

test("accepts a short beneficiary name while retaining nonblank and reward narrative requirements", () => {
  const packet = fixture();
  const reward = packet.candidates[0].spineRetention.rewards[0];
  reward.beneficiary = "서준혁";
  assert.equal(validateFireflyReviewPacket(reseal(packet)).candidates[0].spineRetention.rewards[0].beneficiary, "서준혁");
  reward.beneficiary = "   ";
  assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /beneficiary must not be blank/);
  reward.beneficiary = "가".repeat(2001);
  assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /beneficiary exceeds 2000/);
  reward.beneficiary = "서준혁";
  for (const key of ["sourceReward", "targetReward", "witness"]) {
    const original = reward[key];
    reward[key] = "삼글자";
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /4 to 2000 characters/);
    reward[key] = original;
  }
});

// Compile the real component for React SSR without loading the app's database routes.
const source = await readFile(new URL("../app/review/planning-evidence.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), componentModule, componentModule.exports);
const { PlanningEvidence, PlanningIndependentSourceReview, PlanningProjectPlan } = componentModule.exports;
const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

test("renders concrete source choices, gains, scope and null relationships without a human premise", () => {
  const candidate = validateFireflyReviewPacket(fixture()).candidates[0];
  const html = renderToStaticMarkup(React.createElement(PlanningEvidence, { candidate }));
  for (const value of Object.values(candidate.spineRetention.sourceReconstruction)) assert.ok(html.includes(escapeHtml(value)));
  for (const item of candidate.spineRetention.decisionComparisons) {
    for (const key of ["sourceChoice", "sourceGain", "targetChoice", "targetGain", "preservedReason"]) assert.ok(html.includes(escapeHtml(item[key])));
  }
  assert.match(html, /해당 없음/);
  assert.doesNotMatch(html, /선택 전제|사적 욕망|undefined/);
  assert.equal(renderToStaticMarkup(React.createElement(PlanningEvidence, { candidate: { ...candidate, spineRetention: undefined } })), "");
});

test("keeps legacy premise/v1 rendering and rejects null relationships on that branch", () => {
  const packet = fixture();
  const candidate = packet.candidates[0];
  delete candidate.projectPlan;
  delete candidate.independentReview.sourceChecks;
  const spine = candidate.spineRetention;
  spine.schemaVersion = "firefly_spine_retention/v1";
  delete spine.sourceReconstruction; delete spine.decisionComparisons; delete spine.rewards;
  spine.relationshipConversion = { sourceFunction: "과거 관계 변화", transformedExpression: "과거 후보의 관계 변화" };
  spine.hookProgression = [1, 2].map((index) => ({ sourceArcId: `TEST-N0${index}`, retainedFunction: "과거 다음 사건 기능", transformedHook: "과거 후보의 다음 질문" }));
  spine.payoffPair = { material: "과거 물질 보상", emotional: "과거 감정 보상", witness: "과거 실제 목격자" };
  candidate.sourcePremise = { slateId: "legacy-premise", candidateId: "p01", candidateSha256: "a".repeat(64), privateWant: "실제 과거 전제", firstChoice: "실제 과거 선택", emotionalPayment: "실제 과거 보상" };
  candidate.railB = ["첫 관계 변화", "다음 관계 변화", "마지막 관계 변화"];
  for (const arc of candidate.arcLadder) arc.relationshipConversion = "과거 관계 변화";
  validateFireflyReviewPacket(reseal(packet));
  const html = renderToStaticMarkup(React.createElement(PlanningEvidence, { candidate }));
  assert.match(html, /선택 전제/); assert.match(html, /과거 감정 보상/);
  delete candidate.sourcePremise;
  assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /combination/);
  candidate.sourcePremise = { slateId: "legacy-premise", candidateId: "p01", candidateSha256: "a".repeat(64), privateWant: "실제 과거 전제", firstChoice: "실제 과거 선택", emotionalPayment: "실제 과거 보상" };
  candidate.arcLadder[0].relationshipConversion = null;
  assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /relationship conversion/);
});

test("keeps independent source failures decisive regardless of score and renders their evidence", () => {
  for (const key of ["selfInterest", "sourceFidelity"]) {
    const packet = fixture();
    const review = packet.candidates[0].independentReview;
    review.sourceChecks[key].passed = false;
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /must fail the planning entry gate/);
    review.entryGate.passed = false;
    review.entryGate.failureReasons = ["원작의 자기 이득을 칭찬으로 바꾼 근거가 확인됨"];
    validateFireflyReviewPacket(reseal(packet));
    const html = renderToStaticMarkup(React.createElement(PlanningIndependentSourceReview, { checks: review.sourceChecks }));
    assert.match(html, /FAIL/);
    assert.ok(html.includes(escapeHtml(review.sourceChecks[key].evidence)));
    assert.ok(html.includes(escapeHtml(review.sourceChecks.commercialReading.evidence)));
    review.verdict = "SURVIVE";
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /cannot SURVIVE/);
  }
});

test("renders all nine plan sections and preserves the exact Markdown in the source view", () => {
  const markdown = fixture().candidates[0].projectPlan.markdown;
  const html = renderToStaticMarkup(React.createElement(PlanningProjectPlan, { markdown }));
  assert.equal((html.match(/<h4>/g) ?? []).length, 9);
  assert.ok(html.includes(`<pre class="planning-markdown-source">${escapeHtml(markdown)}</pre>`));
  for (const question of ["WHO", "WHAT", "HOW", "WHERE", "WHEN", "WHY"]) assert.ok(html.includes(question));
});

test("renders plan tables and escapes embedded HTML and remote media", () => {
  const markdown = "## 표 검토\n\n| 원작 | 후보 |\n| --- | --- |\n| **자기 지분** | `자기 이득` |\n\n<script>alert(1)</script>\n\n![외부 이미지](https://example.com/a.png)";
  const html = renderToStaticMarkup(React.createElement(PlanningProjectPlan, { markdown }));
  assert.match(html, /<table>/); assert.match(html, /<strong>자기 지분<\/strong>/); assert.match(html, /<code>자기 이득<\/code>/);
  assert.doesNotMatch(html, /<script>|<img /);
  assert.match(html, /&lt;script&gt;/);
});
