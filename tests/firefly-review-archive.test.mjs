import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import * as Phosphor from "@phosphor-icons/react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as catalog from "../app/firefly-review-catalog.ts";
import * as collectionModel from "../app/review/collection-model.ts";
import * as canaryCatalog from "../app/firefly-canary-catalog.mjs";
import * as queue from "../app/firefly-review-queue.ts";
import { mergeFireflyReviewPackets, validateFireflyReviewPacketStaticIndex } from "../app/firefly-review-packet-index.mjs";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { fireflyReviewQueueMetadata } from "../app/firefly-review-display.mjs";
import { resolvePlanningBaselines } from "../app/firefly-planning-baseline.ts";

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const registry = await json("../data/firefly/review-packets/archives.json");
const invalidations = (await json("../data/firefly/review-packets/invalidations.json")).invalidations;
const packets = mergeFireflyReviewPackets(validateFireflyReviewPacketStaticIndex(await json("../data/firefly/review-packets/index.json")).packets, [validateFireflyReviewPacket(await json("../data/firefly/review-packets/current.json"))]);
const archives = new Map(catalog.validateReviewArchives(registry, packets).map((row) => [row.packetId, row]));
const currentId = "frp-30945a8618f92b17b5069c1c";
const current = packets.find((packet) => packet.packetId === currentId);
const oldPlan = packets.find((packet) => packet.packetId === "frp-cc93f2bb015349cd5413aa0e");
const user = { id: "test", email: "test@example.invalid", role: "admin", username: "test", displayName: "검토자" };
const require = createRequire(import.meta.url);
async function component(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}

test("archives only the exact existing history and keeps both current candidates and future imports active", () => {
  const before = JSON.stringify([packets, registry]);
  assert.equal(packets.length, 18);
  assert.equal(archives.size, 17);
  assert.deepEqual(packets.filter((p) => !archives.has(p.packetId)).map((p) => p.packetId), [currentId]);
  assert.deepEqual(current.candidates.map((c) => c.id), ["v01", "v02"]);
  const future = { packetId: "new-import", packetSha256: "a".repeat(64) };
  const newArchives = catalog.validateReviewArchives(registry, [...packets, future]);
  assert.ok(!newArchives.some((item) => item.packetId === future.packetId));
  const restored = catalog.validateReviewArchives({ ...registry, archives: registry.archives.filter((item) => item.packetId !== oldPlan.packetId) }, packets);
  assert.ok(!restored.some((item) => item.packetId === oldPlan.packetId));
  const baseline = resolvePlanningBaselines(packets, new Set([currentId]))[currentId];
  assert.equal(baseline.packetId, oldPlan.packetId);
  assert.match(baseline.markdown, /작품의 육하원칙/);
  assert.equal(baseline.reviewHref, undefined);
  for (const change of [
    (r) => { r.archives.push(r.archives[0]); },
    (r) => { r.archives[0].packetSha256 = "b".repeat(64); },
    (r) => { r.archives[0] = { packetId: "unknown", archivedAt: "2026-09-06", reason: "bad" }; },
  ]) {
    const copy = structuredClone(registry); change(copy);
    assert.throws(() => catalog.validateReviewArchives(copy, packets));
  }
  assert.equal(JSON.stringify([packets, registry]), before);
});

test("kanban derives receipt states without turning a human opinion into completion", () => {
  assert.equal(catalog.reviewKanbanStage(current, []), "waiting");
  for (const decision of ["select", "hold", "reject"]) assert.equal(catalog.reviewKanbanStage(current, [{ status: "pending", decision }]), "recorded");
  const v2 = { schemaVersion: "firefly_review_packet/v2" };
  assert.equal(catalog.reviewKanbanStage(v2, [{ status: "acknowledged" }]), "confirmed");
  assert.equal(catalog.reviewKanbanStage(v2, [{ status: "applied" }]), "waiting");
  assert.equal(catalog.reviewKanbanStage({ schemaVersion: "firefly_review_packet/v1" }, [{ status: "applied" }]), "confirmed");
});

test("kanban and archive use the same packet identities with exact candidate links", async () => {
  const { ReviewCollection } = await component("../app/review/collection.tsx", {
    "./bulk-review-actions": {BulkReviewActions: ({children}) => children, BulkReviewCheckbox: () => null},
    "./canary-card": await component("../app/review/canary-card.tsx",{"../firefly-canary-catalog.mjs":canaryCatalog}),
    "../global-sidebar": { GlobalSidebar: () => null }, "../firefly-review-catalog": catalog, "./collection-model.ts": collectionModel,
    "../firefly-review-display.mjs": { fireflyReviewQueueMetadata },
  });
  const entries = packets.map((packet) => ({ packet, decisions: [], archive: archives.get(packet.packetId), invalidationReason: invalidations.find((item) => item.packetId === packet.packetId)?.reason }));
  const board = renderToStaticMarkup(React.createElement(ReviewCollection, { user, entries, mode: "board", query: {view:"board"}, archiveCount: 17 }));
  assert.equal((board.match(/class="ff-review-card"/gu) ?? []).length, 1);
  for (const candidate of current.candidates) assert.ok(board.includes(catalog.reviewDetailHref(currentId, candidate.id)));
  for (const id of archives.keys()) assert.ok(!board.includes(`id="packet-${id}"`));
  const history = renderToStaticMarkup(React.createElement(ReviewCollection, { user, entries, mode: "archive", query: {view:"board"}, archiveCount: 17 }));
  assert.equal((history.match(/class="ff-review-card"/gu) ?? []).length, 17);
  assert.equal((history.match(/>무효 기록<\/span>/gu) ?? []).length, 2);
  assert.ok(!history.includes(`id="packet-${currentId}"`));
  for (const packet of packets.filter((p) => archives.has(p.packetId))) for (const candidate of packet.candidates) assert.ok(history.includes(catalog.reviewDetailHref(packet.packetId, candidate.id, true)));
  assert.doesNotMatch(board + history, /method="post"|draggable=/);
  const canaries = ['complete','incomplete','failed'].map((state,i)=>({canary:{id:`fcp-${i}`,title:`비교 ${i}`,state,generatedAt:'2026-09-06',author:{route:'웹',model:'관찰 모델',reasoning:'최고'}},decisions:i===1?[{decision:'hold',status:'pending',createdAt:'2026-09-06'}]:[]}));
  const combined=renderToStaticMarkup(React.createElement(ReviewCollection,{user,entries,mode:'board',query:{view:'board'},archiveCount:17,canaries}));
  assert.equal((combined.match(/class="ff-review-card"/gu)??[]).length,4);
  for(const e of canaries)assert.ok(combined.includes(`/review/canary/${e.canary.id}`));
  const list = renderToStaticMarkup(React.createElement(ReviewCollection,{user,entries,mode:'board',archiveCount:17,canaries}));
  assert.match(list, /<table/);
  assert.equal((list.match(/<tr id=/g) ?? []).length,4);
  assert.doesNotMatch(list,/실행 영수증|class="ff-review-card"/);
  for (const candidate of current.candidates) assert.ok(list.includes(catalog.reviewDetailHref(currentId,candidate.id)));
  assert.match(combined,/실행 영수증/);assert.match(combined,/실행 실패/);assert.match(combined,/보류/);

});

test("archived detail preserves text and comments while removing decision controls", async () => {
  const evidence = await component("../app/review/planning-evidence.tsx");
  const variation = await component("../app/review/planning-variation.tsx", { "./planning-evidence": evidence });
  const legacyVariation = packets.find((p) => p.packetId === "frp-08a029b4381f5a2c61f530b1");
  const recommended = legacyVariation.candidates.find((c) => c.id === legacyVariation.recommendation.candidateId);
  const legacyHtml = renderToStaticMarkup(React.createElement(variation.PlanningVariationReview, { packet: legacyVariation, candidate: recommended }));
  assert.ok(legacyHtml.includes(renderToStaticMarkup(React.createElement("p", null, legacyVariation.recommendation.reason))));
  const { FireflyReviewBoard } = await component("../app/review/review-board.tsx", {
    "@phosphor-icons/react": Phosphor,
    "./planning-evidence": evidence, "./planning-variation": variation,
    "@/app/global-sidebar": { GlobalSidebar: () => null }, "@/app/firefly-review-display.mjs": { fireflyReviewQueueMetadata },
  });
  for (const packet of [oldPlan, packets.find((p) => p.schemaVersion === "firefly_review_packet/v1"), packets.find((p) => p.schemaVersion === "firefly_review_packet/v5" && p.packetId !== currentId)]) {
    const html = renderToStaticMarkup(React.createElement(FireflyReviewBoard, { user, packets: [packet], completedCount: 0, initialDecisions: { [packet.packetId]: [{ decisionId: "history", candidateId: packet.candidates[0].id, decision: "hold", status: "pending", comment: "보존할 과거 코멘트 <script>", createdAt: "2026-09-06T00:00:00Z" }] }, archive: { ...archives.get(packet.packetId), invalidated: false } }));
    assert.match(html, /보관된 이전 검토 · 읽기 전용/);
    assert.match(html, /보존할 과거 코멘트 &lt;script&gt;/);
    assert.doesNotMatch(html, /<form|<textarea|type="radio"/);
    assert.match(html, /최근 판정/);
  }
});

test("old review deep links redirect to the exact archived candidate before any snapshot write", async () => {
  const { default: ReviewPage } = await component("../app/review/page.tsx", {
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT ${url}`); } },
    "@/app/chatgpt-auth": { requireChatGPTUser: async () => user },
    "@/app/firefly-canaries": { listPlanningCanaries: () => [] },
    "@/app/firefly-review-data": { ensureFireflyReviewSnapshot: () => { throw new Error("Unexpected write"); } },
    "@/app/firefly-review-packets": { listFireflyReviewPackets: () => packets, getFireflyReviewArchive: (id) => archives.get(id) },
    "@/app/firefly-review-catalog": catalog, "@/app/firefly-review-queue": queue,
    "@/app/firefly-planning-baseline": { resolvePlanningBaselines }, "@/app/firefly-planning-documents": { resolvePlanningDocuments: () => ({}) }, "@/data/firefly/planning-documents/index.json": [], "./review-board": {},
  });
  await assert.rejects(ReviewPage({ searchParams: Promise.resolve({ packet: oldPlan.packetId, candidate: "p01" }) }), { message: `REDIRECT ${catalog.reviewDetailHref(oldPlan.packetId, "p01", true)}` });
});

test("confirmed kanban links keep the exact requested packet in read-only mode", async () => {
  const done = packets.find((packet) => packet.schemaVersion === "firefly_review_packet/v1");
  const { default: ReviewPage } = await component("../app/review/page.tsx", {
    "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); }, notFound: () => { throw new Error("NOT FOUND"); } },
    "@/app/chatgpt-auth": { requireChatGPTUser: async () => user },
    "@/app/firefly-canaries": { listPlanningCanaries: () => [] },
    "@/app/firefly-review-data": { ensureFireflyReviewSnapshot: async () => {}, listFireflyReviewDecisions: async (id) => id === done.packetId ? [{ status: "applied" }] : [], toFireflyReviewDecisionContract: (row) => row },
    "@/app/firefly-review-packets": { listFireflyReviewPackets: () => [current, done], getFireflyReviewArchive: () => undefined },
    "@/app/firefly-review-catalog": catalog, "@/app/firefly-review-queue": queue,
    "@/app/firefly-planning-baseline": { resolvePlanningBaselines }, "@/app/firefly-planning-documents": { resolvePlanningDocuments: () => ({}) }, "@/data/firefly/planning-documents/index.json": [], "./review-board": { FireflyReviewBoard: () => null },
  });
  const result = await ReviewPage({ searchParams: Promise.resolve({ packet: done.packetId, candidate: done.candidates[0].id }) });
  assert.deepEqual(result.props.packets.map((packet) => packet.packetId), [done.packetId]);
  assert.equal(result.props.completed, true);
  assert.equal(result.props.archive, undefined);
  await assert.rejects(ReviewPage({ searchParams: Promise.resolve({ packet: done.packetId, candidate: "wrong" }) }), /NOT FOUND/);
});

test("archive server detail checks admin and candidate identity and only reads history", async () => {
  let role = "user";
  let reads = 0;
  const { ArchivedReviewDetail } = await component("../app/review/archive/detail.tsx", {
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT FOUND"); } },
    "@/app/chatgpt-auth": { requireChatGPTUser: async () => ({ ...user, role }) },
    "@/app/firefly-review-data": { listFireflyReviewDecisions: async () => { reads++; return []; }, toFireflyReviewDecisionContract: (row) => row },
    "@/app/firefly-review-packets": { listStoredFireflyReviewPackets: () => packets, getFireflyReviewArchive: (id) => archives.get(id), getFireflyReviewInvalidation: (id) => invalidations.find((item) => item.packetId === id) },
    "@/app/firefly-review-catalog": catalog, "@/app/firefly-planning-baseline": { resolvePlanningBaselines }, "@/app/firefly-planning-documents": { resolvePlanningDocuments: () => ({}) }, "@/data/firefly/planning-documents/index.json": [],
    "../review-board": { FireflyReviewBoard: () => null }, "../collection": {},
  });
  await assert.rejects(ArchivedReviewDetail({ packetId: oldPlan.packetId, candidateId: "p01" }), /REDIRECT \//);
  assert.equal(reads, 0);
  role = "admin";
  await assert.rejects(ArchivedReviewDetail({ packetId: oldPlan.packetId, candidateId: "missing" }), /NOT FOUND/);
  assert.equal(reads, 0);
  const result = await ArchivedReviewDetail({ packetId: oldPlan.packetId, candidateId: "p01" });
  assert.equal(result.props.packets[0].packetId, oldPlan.packetId);
  assert.ok(result.props.archive);
  assert.equal(reads, 1);
  await assert.rejects(ArchivedReviewDetail({ packetId: currentId, candidateId: "v01" }), /NOT FOUND/);
});
