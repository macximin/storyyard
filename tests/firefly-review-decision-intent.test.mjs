import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { validateFireflyDecisionIntent } from "../app/firefly-review-decision-intent.ts";
import { makeFireflyReviewPacketV2 } from "./firefly-review-v2-fixture.mjs";

test("requires an explicit human evaluation choice and exact selected candidate", () => {
  const packet = makeFireflyReviewPacketV2();
  assert.equal(validateFireflyDecisionIntent(packet, null).ok, false);
  assert.equal(validateFireflyDecisionIntent(packet, { decision: "select" }).ok, false);

  const selected = packet.candidates[1];
  const result = validateFireflyDecisionIntent(packet, {
    decision: "select",
    candidateId: selected.id,
    candidateSha256: selected.sha256,
    comment: "사람이 직접 고름",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.candidate?.id, selected.id);
    assert.equal(result.value.storedCandidateId, selected.id);
  }
});

test("allows tie or invalid only without a candidate and with a human reason", () => {
  const packet = makeFireflyReviewPacketV2();
  for (const decision of ["tie", "invalid"]) {
    assert.equal(validateFireflyDecisionIntent(packet, { decision }).ok, false);
    assert.equal(validateFireflyDecisionIntent(packet, {
      decision,
      candidateId: packet.candidates[0].id,
      candidateSha256: packet.candidates[0].sha256,
      comment: "근거",
    }).ok, false);
    const result = validateFireflyDecisionIntent(packet, {
      decision,
      candidateId: null,
      candidateSha256: null,
      comment: "사람이 직접 판정한 근거",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.candidate, null);
      assert.equal(result.value.storedCandidateId, "");
    }
  }
});

test("preserves the legacy v1 manuscript decision contract", async () => {
  const packet = validateFireflyReviewPacket(JSON.parse(await readFile(
    new URL("../data/firefly/review-packets/current.json", import.meta.url),
    "utf8",
  )));
  assert.equal(packet.schemaVersion, "firefly_review_packet/v1");
  const candidate = packet.candidates[0];
  assert.equal(validateFireflyDecisionIntent(packet, {
    decision: "approve",
    candidateId: candidate.id,
    candidateSha256: candidate.sha256,
  }).ok, true);
  assert.equal(validateFireflyDecisionIntent(packet, {
    decision: "select",
    candidateId: candidate.id,
    candidateSha256: candidate.sha256,
  }).ok, false);
});
