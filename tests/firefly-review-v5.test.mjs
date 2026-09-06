import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import * as Phosphor from "@phosphor-icons/react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { variationReviewHash } from "../app/firefly-variation-review-contract.ts";
import { validateFireflyDecisionIntent } from "../app/firefly-review-decision-intent.ts";
import { buildFireflyReviewPacketStaticIndex, validateFireflyReviewPacketStaticIndex } from "../app/firefly-review-packet-index.mjs";
import { fireflyReviewQueueMetadata } from "../app/firefly-review-display.mjs";

const bytes = await readFile(new URL("./fixtures/planning-variation-review-v5.json", import.meta.url), "utf8");
const fixture = () => JSON.parse(bytes);
function reseal(packet) {
  for (const candidate of packet.candidates) {
    const { sha256: _sha, ...unsigned } = candidate;
    candidate.sha256 = variationReviewHash(unsigned);
  }
  const { schemaVersion: _version, packetId: _id, packetSha256: _sha, ...unsigned } = packet;
  packet.packetSha256 = variationReviewHash(unsigned);
  packet.packetId = `frp-${packet.packetSha256.slice(0, 24)}`;
  return packet;
}

test("reads a bounded variation in the existing queue without requiring a full plan or manuscript", () => {
  const packet = validateFireflyReviewPacket(fixture());
  assert.equal(packet.purpose, "planning-variation");
  assert.equal(packet.authority.decisionEffect, "variation-selection");
  assert.equal(packet.authority.bookCreation, false);
  assert.equal(packet.authority.manuscriptApply, false);
  assert.equal(packet.baseline.candidateId, "p01");
  assert.equal(packet.candidates[0].projectPlan, undefined);
  assert.equal(packet.candidates[0].markdown, fixture().candidates[0].markdown);
  const index = buildFireflyReviewPacketStaticIndex([packet]);
  assert.equal(validateFireflyReviewPacketStaticIndex(index).packets[0].packetSha256, packet.packetSha256);
  assert.match(fireflyReviewQueueMetadata(packet), /초반 구간 변주 · 1~4화 · 2개 후보/u);
});

test("binds every candidate text and independent check, as well as baseline and scope", () => {
  for (const mutate of [
    (p) => { p.candidates[0].markdown += "변조"; },
    (p) => { p.candidates[0].independentReview.readingPleasure.evidence += "변조"; },
    (p) => { p.baseline.planSha256 = "e".repeat(64); },
    (p) => { p.scope.through = "다른 범위"; },
  ]) {
    const packet = fixture(); mutate(packet);
    assert.throws(() => validateFireflyReviewPacket(packet), /SHA mismatch|identity mismatch/u);
  }
});

test("matches the producer's calendar and UTC timestamp boundaries", () => {
  for (const value of ["2026-02-31T00:00:00Z", "2026-09-06T24:00:00Z", "2026-09-06T00:00:60Z", "2026-09-06T00:00:00+09:00"]) {
    const packet = fixture(); packet.generatedAt = value;
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /timestamp/u);
  }
  for (const value of ["2026-09-06T00:00Z", "0000-02-29T00:00:00Z", "2024-02-29T00:00:00.123456Z"]) {
    const packet = fixture(); packet.generatedAt = value;
    assert.equal(validateFireflyReviewPacket(reseal(packet)).generatedAt, value);
  }
});

test("rejects failed ready reviews, non-ready recommendations, scope expansion and promotion fields", () => {
  for (const key of ["sourceAccuracy", "selfInterest", "causalCoherence", "variationQuality"]) {
    const packet = fixture(); packet.candidates[0].independentReview[key].passed = false;
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)), /Failed checks cannot receive a ready/u);
  }
  for (const mutate of [
    (p) => { p.recommendation.candidateId = "v02"; },
    (p) => { p.scope.episodeEnd = 8; },
    (p) => { p.authority.bookCreation = true; },
    (p) => { p.authority.manuscriptApply = true; },
    (p) => { p.authority.decisionEffect = "planning-selection"; },
    (p) => { p.candidates[1].id = p.candidates[0].id; },
    (p) => { p.baseline.selected = true; },
    (p) => { p.candidates[0].projectPlan = { markdown: "invented" }; },
  ]) {
    const packet = fixture(); mutate(packet);
    assert.throws(() => validateFireflyReviewPacket(reseal(packet)));
  }
  const multipleReady = fixture(); multipleReady.candidates[1].independentReview.verdict = "ready";
  assert.equal(validateFireflyReviewPacket(reseal(multipleReady)).candidates.length, 2);
});

test("selection must identify an exact variation; baseline, stale SHA and manuscript actions fail", () => {
  const packet = validateFireflyReviewPacket(fixture());
  const candidate = packet.candidates[0];
  const input = { decision: "select", candidateId: candidate.id, candidateSha256: candidate.sha256 };
  assert.equal(validateFireflyDecisionIntent(packet, input).ok, false);
  assert.equal(validateFireflyDecisionIntent(packet, { ...input, comment: "자기 이익으로 이어지는 사건이 마음에 든다." }).ok, true);
  assert.equal(validateFireflyDecisionIntent(packet, { ...input, candidateId: "p01" }).ok, false);
  assert.equal(validateFireflyDecisionIntent(packet, { ...input, candidateSha256: "a".repeat(64) }).ok, false);
  for (const decision of ["approve", "polish", "tie", "invalid", "hold", "reject"]) {
    assert.equal(validateFireflyDecisionIntent(packet, { ...input, decision }).ok, false);
  }
  assert.equal(validateFireflyDecisionIntent(packet, { ...input, decision: "hold", comment: "선행 조건을 확인한다." }).ok, true);
});

const require = createRequire(import.meta.url);
async function component(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

test("renders complete escaped Markdown, all independent evidence and the bounded choice labels", async () => {
  const evidence = await component("../app/review/planning-evidence.tsx");
  const variation = await component("../app/review/planning-variation.tsx", { "./planning-evidence": evidence });
  const board = await component("../app/review/review-board.tsx", {
    "@phosphor-icons/react": Phosphor,
    "./planning-evidence": evidence, "./planning-variation": variation,
    "@/app/global-sidebar": { GlobalSidebar: () => null },
    "@/app/firefly-review-display.mjs": { fireflyReviewQueueMetadata },
  });
  const packet = fixture();
  packet.candidates[0].markdown += '\n\n<script>alert("unsafe")</script>\n![remote](https://example.invalid/a.png)';
  const safe = validateFireflyReviewPacket(reseal(packet));
  const html = renderToStaticMarkup(React.createElement(board.FireflyReviewBoard, { user: { id: "test", email: "test@example.invalid", role: "admin" }, packets: [safe], completedCount: 0, initialDecisions: {} }));
  for (const needle of ["초반 구간 변주안", "원문 사실", "자기 이익 우선", "선행 조건·후속 인과", "사건 변주의 실질", "이 변주 방향 선택", "변주안 보류", "이 변주안 반려", "선택한 방향은 다음 전체 기획서의 기준이 됩니다.", "판정 이유 (필수)"]) assert.ok(html.includes(needle), needle);
  for (const heading of ["초반 이야기", "사건을 어떻게 바꾸는가", "도입 4화", "첫 투자와 회수", "배치와 남은 판단", "실제 원문 근거"]) assert.ok(html.includes(heading), heading);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("현재 InkOS 원고와 비교"));
  assert.ok(!html.includes("<span>상업성</span>"));
});

test("opens a linked plan or variation and keeps a candidate inside its own packet", async () => {
  const evidence = await component("../app/review/planning-evidence.tsx");
  const variation = await component("../app/review/planning-variation.tsx", { "./planning-evidence": evidence });
  const board = await component("../app/review/review-board.tsx", {
    "@phosphor-icons/react": Phosphor,
    "./planning-evidence": evidence, "./planning-variation": variation,
    "@/app/global-sidebar": { GlobalSidebar: () => null },
    "@/app/firefly-review-display.mjs": { fireflyReviewQueueMetadata },
  });
  const variant = validateFireflyReviewPacket(fixture());
  const plan = validateFireflyReviewPacket(JSON.parse(await readFile(new URL("./fixtures/inkos-source-first-pitch-review-v3.json", import.meta.url), "utf8")));
  const render = (initialPacketId, initialCandidateId) => renderToStaticMarkup(React.createElement(board.FireflyReviewBoard, {
    user: { id: "test", email: "test@example.invalid", role: "admin" }, packets: [variant, plan], completedCount: 0, initialDecisions: {}, initialPacketId, initialCandidateId,
  }));
  assert.ok(render(variant.packetId, variant.candidates[1].id).includes(`<h3>${variant.candidates[1].title}</h3>`));
  const planHtml = render(plan.packetId, variant.candidates[1].id);
  assert.ok(planHtml.includes("작품 기획서"));
  assert.ok(!planHtml.includes("<h3>초반 구간 변주안</h3>"));
  assert.ok(render("missing", plan.candidates[0].id).includes(`<h3>${variant.candidates[0].title}</h3>`));
});

test("actual planning opens with the document and keeps technical audits folded without changing owner feedback", async () => {
  const evidence = await component("../app/review/planning-evidence.tsx");
  const variation = await component("../app/review/planning-variation.tsx", { "./planning-evidence": evidence });
  const board = await component("../app/review/review-board.tsx", {
    "@phosphor-icons/react": Phosphor,
    "./planning-evidence": evidence, "./planning-variation": variation,
    "@/app/global-sidebar": { GlobalSidebar: () => null },
    "@/app/firefly-review-display.mjs": { fireflyReviewQueueMetadata },
  });
  const plan = validateFireflyReviewPacket(JSON.parse(await readFile(new URL("../data/firefly/review-packets/immutable/frp-37e1670f18b2933c2647bc1e.json", import.meta.url), "utf8")));
  const html = renderToStaticMarkup(React.createElement(board.FireflyReviewBoard, {
    user: { id: "test", email: "test@example.invalid", role: "admin" }, packets: [plan], completedCount: 0,
    initialDecisions: { [plan.packetId]: [
      { decisionId: "test-format-comment", candidateId: "p01", decision: "select", comment: "양식을 사람이 읽기 쉽게 정리해 줘", status: "pending", createdAt: "2026-09-06T00:00:00Z" },
      { decisionId: "test-format-rejection", candidateId: "p01", decision: "reject", comment: "기획서 양식이 싫어", status: "pending", createdAt: "2026-09-05T00:00:00Z" },
    ] }, initialPacketId: plan.packetId, initialCandidateId: "p01",
  }));
  assert.ok(html.indexOf("<h3>작품 기획서</h3>") < html.indexOf("독립 심사자의 원문 대조"));
  let depth = 0;
  const visible = html.split(/(<\/?details\b[^>]*>)/u).map((token) => {
    if (/^<details\b/u.test(token)) { if (depth || !/\bopen(?:[\s=>])/u.test(token)) depth++; return depth ? "" : token; }
    if (token === "</details>" && depth) { depth--; return ""; }
    return depth ? "" : token;
  }).join("");
  assert.match(visible, /작품 기획서/);
  assert.doesNotMatch(visible, /p01\.linkedCausalAdjustments|배열 첨자는 0부터|INDEPENDENT ENTRY GATE/);
  assert.match(html, /양식을 사람이 읽기 쉽게 정리해 줘/);
  assert.match(html, /기획서 양식이 싫어/);
  assert.doesNotMatch(html, /type="radio"[^>]*checked/);
});
