import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { validateFireflyDecisionIntent } from "../app/firefly-review-decision-intent.ts";

for (const [fixtureName, decisionVersion] of [["inkos-source-first-pitch-review-v3.json", "v3"], ["planning-variation-review-v5.json", "v5"]]) {
test(`stores ${decisionVersion} artifact identity and exact candidate hashes as a pending decision`, async () => {
  const packet = validateFireflyReviewPacket(JSON.parse(await readFile(new URL(`./fixtures/${fixtureName}`, import.meta.url), "utf8")));
  const candidate = packet.candidates[0];
  const stored = [];
  const snapshots = [];
  const columns = new Proxy({}, { get: (_target, key) => key });
  let acknowledgeAttempt = false;
  const db = {
    select() {
      const query = { from: () => query, where: () => query, orderBy: () => query, limit: async () => acknowledgeAttempt ? stored : [] };
      return query;
    },
    insert: () => ({ values: async (value) => { stored.push(value); } }),
  };
  const mocks = {
    "drizzle-orm": { and: (...args) => args, or: (...args) => args, eq: (...args) => args, desc: (arg) => arg },
    "@/app/chatgpt-auth": { getChatGPTUser: async () => ({ id: "test-owner", email: "test@example.invalid", role: "admin" }), runtimeSecret: () => "" },
    "@/app/firefly-review-ack": {},
    "@/app/firefly-review-decision-intent": { validateFireflyDecisionIntent },
    "@/app/firefly-review-data": { ensureFireflyReviewSnapshot: async (value) => { snapshots.push(value); }, toFireflyReviewDecisionContract: (value) => value },
    "@/app/firefly-review-contract": { allSurfaceMatches: () => [] },
    "@/app/firefly-review-packets": { getFireflyReviewPacket: (id) => id === packet.packetId ? packet : undefined },
    "@/app/firefly-review-service-auth": { hasDistinctBearerAuthority: () => acknowledgeAttempt },
    "@/db": { getDb: () => db },
    "@/db/schema": { fireflyReviewDecisions: columns },
  };
  const source = await readFile(new URL("../app/api/firefly/review-decisions/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, module, module.exports);
  const response = await module.exports.POST(new Request("http://localhost/api/firefly/review-decisions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ packetId: packet.packetId, packetSha256: packet.packetSha256, candidateId: candidate.id, candidateSha256: candidate.sha256, decision: "select", comment: "합성 저장 payload 검증" }),
  }));
  assert.equal(response.status, 201);
  assert.equal(stored.length, 1);
  assert.equal(snapshots.length, 1);
  assert.equal(stored[0].artifactId, packet.artifact.id);
  assert.equal(stored[0].bookId, packet.source.slateId);
  assert.equal(stored[0].packetSha256, packet.packetSha256);
  assert.equal(stored[0].candidateId, candidate.id);
  assert.equal(stored[0].candidateSha256, candidate.sha256);
  assert.equal(stored[0].schemaVersion, `firefly_review_decision/${decisionVersion}`);
  assert.equal(stored[0].status, "pending");
  assert.equal(stored[0].appliedAt, null);
  assert.equal(stored[0].applyReceiptPath, null);
  assert.equal((await response.json()).decision.artifactId, packet.artifact.id);
  acknowledgeAttempt = true;
  const apply = await module.exports.PATCH(new Request("http://localhost/api/firefly/review-decisions", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisionId: stored[0].id }),
  }));
  assert.equal(apply.status, 409);
  assert.equal(stored[0].status, "pending");
});
}
