import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import * as Phosphor from "@phosphor-icons/react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { resolvePlanningDocuments } from "../app/firefly-planning-documents.ts";
import { variationReviewHash } from "../app/firefly-variation-review-contract.ts";
import { validateFireflyReviewPacketStaticIndex } from "../app/firefly-review-packet-index.mjs";
import { fireflyReviewQueueMetadata } from "../app/firefly-review-display.mjs";

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const packets = validateFireflyReviewPacketStaticIndex(await json("../data/firefly/review-packets/index.json")).packets;
const index = await json("../data/firefly/planning-documents/index.json");
const packet = packets.find((p) => p.packetId === "frp-30945a8618f92b17b5069c1c");
const documents = resolvePlanningDocuments(packets, index);
const require = createRequire(import.meta.url);
async function component(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const sha = (text) => createHash("sha256").update(text).digest("hex");
function signedCopy(change) {
  const copy = structuredClone(index);
  change(copy[0]);
  const { sha256, ...unsigned } = copy[0];
  copy[0].sha256 = variationReviewHash(unsigned);
  return copy;
}

test("InkOS plan exports bind every current candidate without changing the sealed packet", () => {
  const before = JSON.stringify(packets);
  assert.deepEqual(Object.keys(documents[packet.packetId]), ["v01", "v02"]);
  assert.throws(() => resolvePlanningDocuments(packets, signedCopy((doc) => { doc.packetSha256 = "0".repeat(64); })), /packet mismatch/);
  assert.throws(() => resolvePlanningDocuments(packets, signedCopy((doc) => { doc.plans[0].candidateSha256 = "0".repeat(64); })), /candidate mismatch/);
  assert.throws(() => resolvePlanningDocuments(packets, signedCopy((doc) => { doc.plans[0].projectPlan.markdown += "changed"; })), /body SHA/);
  assert.throws(() => resolvePlanningDocuments(packets, signedCopy((doc) => { doc.plans.pop(); })), /every current candidate/);
  assert.throws(() => resolvePlanningDocuments(packets, signedCopy((doc) => {
    const plan = doc.plans[0];
    plan.projectPlan.markdown = plan.projectPlan.markdown.replace("HOW", "방법");
    plan.projectPlanSha256 = sha(plan.projectPlan.markdown);
  })), /all six questions/);
  assert.throws(() => resolvePlanningDocuments(packets, signedCopy((doc) => {
    const plan = doc.plans[0];
    plan.projectPlan.markdown = plan.projectPlan.markdown.replace("## 9.", "## 누락.");
    plan.projectPlanSha256 = sha(plan.projectPlan.markdown);
  })), /nine sections/);
  assert.equal(JSON.stringify(packets), before);
});

test("both live candidates open as the same full nine-section plan, with WHAT and HOW visible", async () => {
  const evidence = await component("../app/review/planning-evidence.tsx");
  const variation = await component("../app/review/planning-variation.tsx", { "./planning-evidence": evidence });
  const { FireflyReviewBoard } = await component("../app/review/review-board.tsx", {
    "@phosphor-icons/react": Phosphor, "./planning-evidence": evidence, "./planning-variation": variation,
    "@/app/global-sidebar": { GlobalSidebar: () => null }, "@/app/firefly-review-display.mjs": { fireflyReviewQueueMetadata },
  });
  for (const candidate of packet.candidates) {
    const html = renderToStaticMarkup(React.createElement(FireflyReviewBoard, {
      user: { id: "test", email: "test@example.invalid", role: "admin", username: "test", displayName: "검토자" },
      packets: [packet], completedCount: 0, initialDecisions: {}, initialCandidateId: candidate.id, planningDocuments: documents,
    }));
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gu, "");
    for (const marker of ["WHO", "WHAT", "HOW", "WHERE", "WHEN", "WHY"]) assert.ok(visible.includes(marker), `${candidate.id}: ${marker} visible`);
    assert.match(visible, /실패한 재벌이 회귀해 자기 성공을 쌓아 가는 이야기/);
    assert.equal((visible.match(/class="ff-plan-section-number"/gu) ?? []).length, 9);
    assert.doesNotMatch(visible, /이전 기준안|현재 전체 기획서는 아직|이번 초반 수정안|OPENING VARIATION|시계|연회|사건을 어떻게 바꾸는가/);
    assert.match(visible, /<form/);
    if (candidate.id === "v01") {
      assert.match(visible, /1992년 8월/);
      assert.match(visible, /미래 경제 사건을 기억한다/);
      assert.match(visible, /정보 우위로 돈을 넣을 방향과 회수할 때/);
      assert.doesNotMatch(visible, /1990년 2월|도현기술/);
    } else {
      assert.match(visible, /1990년 2월/);
      assert.match(visible, /실제 제품 기회는 매각 자료·개발 기록·고객 조사/);
      assert.doesNotMatch(visible, /애슈턴펌프|1992년 8월/);
    }
    const nativeHtml = renderToStaticMarkup(React.createElement(variation.PlanningVariationReview, {
      packet, candidate: { ...candidate, markdown: documents[packet.packetId][candidate.id].projectPlan.markdown },
    }));
    assert.match(nativeHtml, /작품의 육하원칙/);
    assert.doesNotMatch(nativeHtml, /OPENING VARIATION|이전 전체 기획서/);
  }
});
