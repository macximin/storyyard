import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateFireflyReviewPacket } from "../app/firefly-review-contract.ts";
import { validateFireflyDecisionIntent } from "../app/firefly-review-decision-intent.ts";
import { buildFireflyReviewPacketStaticIndex } from "../app/firefly-review-packet-index.mjs";

function canonicalSha256(value) {
  const sort = (item) => Array.isArray(item)
    ? item.map(sort)
    : item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sort(child)]))
      : item;
  return createHash("sha256").update(JSON.stringify(sort(value))).digest("hex");
}

function makeCandidate(id = "p01", verdict = "SURVIVE") {
  const candidate = {
    id,
    titleCandidates: ["부도 회사를 먹는 재벌 막내"],
    oneLinePromise: "쫓겨난 실무자가 오늘 버려진 공장을 사 자기 기업 제국의 첫 자산으로 만든다.",
    entryContract: {
      humanDrive: {
        lackOrHumiliation: "그룹에서 쫓겨났다.", personalDesire: "자기 이름의 기업을 갖는다.",
        selfInterest: "첫 공장을 자기 법인에 귀속한다.", emotionalCostLimit: "모욕 뒤 즉시 선택권을 행사한다.",
      },
      purpose: {
        seriesWhat: "그룹 지배권을 산다.", arcWhat: "첫 회사를 소유한다.",
        chapterWant: "오늘 계약금을 걸고 공장 열쇠를 얻는다.", whyNow: "세 시간 뒤 철거 입찰이 끝난다.",
      },
      commercialPromise: {
        currentSituation: "철거 직전 공장 문 앞이다.", repeatableReaderFantasy: "버린 회사를 사서 제국을 만든다.",
        howAdvantage: "전생의 수주 장부를 안다.", firstPayoff: "공장과 첫 입금을 얻는다.",
        payoffWitness: "그를 내쫓던 비서실장이 목격한다.", nextPaymentQuestion: "숨은 수주로 다음 회사를 살 수 있는가.",
      },
    },
    protagonist: { startingIdentity: "쫓겨난 실무자", repeatedVerb: "사고 정상화한다", firstAsset: "부도 공장" },
    openingEpisodes: [1, 2, 3, 4].map((episode) => ({ episode, event: `${episode}화 거래`, visiblePayoff: `${episode}화 자산 지급` })),
    firstReward: "2화 현금과 공장 열쇠",
    railA: ["첫 공장", "계열사", "그룹"], railB: ["직원 인정", "가족 견제", "아버지 굴복"],
    arcLadder: [1, 2, 3, 4, 5, 6].map((arc) => ({ arc, externalMove: `${arc}차 인수`, visibleReward: `${arc}차 자산`, relationshipConversion: `${arc}차 대우 변화` })),
    longRunRisk: "인수전의 승부 수단이 반복될 수 있다.",
    independentReview: {
      verdict,
      independentScore: { promise: 19, earlyPayoff: 19, repeatEngine: 18, railConversion: 18, longRunSupply: 17, total: 91 },
      entryGate: {
        passed: true, protagonistNow: "쫓겨난 실무자", personalWant: "자기 기업을 갖는다", whyNow: "오늘 입찰이 끝난다",
        repeatableFantasy: "회사를 사서 제국을 만든다", chapterGoal: "계약금을 걸고 공장 열쇠를 얻는다", failureReasons: [],
      },
      decisiveStrength: "욕망과 첫 결제가 빠르다.", decisiveRisk: "인수전 반복 위험이 있다.", requiredRepair: "Arc별 승부 수단을 분리한다.",
    },
  };
  return { ...candidate, sha256: canonicalSha256(candidate) };
}

function makePacket() {
  const body = {
    generatedAt: "2026-09-03T12:00:00.000Z",
    purpose: "planning-entry",
    source: { system: "inkos", slateId: "chaebol-entry-hil", sourceRevision: "a".repeat(64) },
    work: { id: "chaebol-entry-hil", title: "현대판타지 재벌물 기획 후보", genre: "modern-fantasy-ko", status: "non-canonical", targetChapters: 200 },
    artifact: { id: "chaebol-entry-hil", kind: "pitch-slate", title: "상업 기획 후보 2종", status: "human-decision-pending" },
    candidates: [makeCandidate("p01", "SURVIVE"), makeCandidate("p02", "HOLD")],
    recommendation: { candidateId: "p01", reason: "욕망과 첫 결제가 가장 빠르다." },
    actions: ["select", "hold", "reject"],
    authority: { canon: "inkos", decisionSurface: "storyyard", decisionEffect: "planning-selection", manuscriptApply: false, reverseSync: false },
  };
  const packetSha256 = canonicalSha256(body);
  return { schemaVersion: "firefly_review_packet/v3", packetId: `frp-${packetSha256.slice(0, 24)}`, packetSha256, ...body };
}

test("accepts immutable planning-entry packets and indexes them before v2 reviews", () => {
  const packet = validateFireflyReviewPacket(makePacket());
  assert.equal(packet.schemaVersion, "firefly_review_packet/v3");
  assert.equal(packet.authority.manuscriptApply, false);
  assert.equal(buildFireflyReviewPacketStaticIndex([packet]).packets[0].purpose, "planning-entry");
});

test("requires an exact candidate for every planning decision and a reason to hold or reject", () => {
  const packet = validateFireflyReviewPacket(makePacket());
  const candidate = packet.candidates[0];
  assert.equal(validateFireflyDecisionIntent(packet, { decision: "select" }).ok, false);
  assert.equal(validateFireflyDecisionIntent(packet, { decision: "hold", candidateId: candidate.id, candidateSha256: candidate.sha256 }).ok, false);
  assert.equal(validateFireflyDecisionIntent(packet, { decision: "tie", candidateId: candidate.id, candidateSha256: candidate.sha256, comment: "동률" }).ok, false);
  assert.equal(validateFireflyDecisionIntent(packet, { decision: "select", candidateId: candidate.id, candidateSha256: candidate.sha256 }).ok, true);
});

test("rejects score drift and a SURVIVE verdict behind a failed entry gate", () => {
  const scoreDrift = makePacket();
  scoreDrift.candidates[0].independentReview.independentScore.total = 92;
  const scoreUnsigned = { ...scoreDrift.candidates[0] };
  delete scoreUnsigned.sha256;
  scoreDrift.candidates[0].sha256 = canonicalSha256(scoreUnsigned);
  assert.throws(() => validateFireflyReviewPacket(scoreDrift), /score total/);

  const failedGate = makePacket();
  failedGate.candidates[0].independentReview.entryGate = { ...failedGate.candidates[0].independentReview.entryGate, passed: false, failureReasons: ["개인 욕망 불명"] };
  const unsigned = { ...failedGate.candidates[0] };
  delete unsigned.sha256;
  failedGate.candidates[0].sha256 = canonicalSha256(unsigned);
  assert.throws(() => validateFireflyReviewPacket(failedGate), /cannot SURVIVE/);
});
