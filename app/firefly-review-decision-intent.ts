import type {
  FireflyDecision,
  FireflyEvaluationDecision,
  FireflyManuscriptDecision,
  FireflyPlanningDecision,
  FireflyReviewPacket,
} from "./firefly-review-contract";

type DecisionIntentInput = {
  candidateId?: string | null;
  candidateSha256?: string | null;
  decision?: FireflyDecision | null;
  comment?: string | null;
};

export type ValidatedDecisionIntent = {
  decision: FireflyDecision;
  comment: string;
  candidate: FireflyReviewPacket["candidates"][number] | null;
  storedCandidateId: string;
  storedCandidateSha256: string;
};

const manuscriptDecisions = new Set<FireflyManuscriptDecision>(["approve", "polish", "hold", "reject"]);
const evaluationDecisions = new Set<FireflyEvaluationDecision>(["select", "tie", "invalid"]);
const planningDecisions = new Set<FireflyPlanningDecision>(["select", "hold", "reject"]);

export function validateFireflyDecisionIntent(
  packet: FireflyReviewPacket,
  input: DecisionIntentInput | null,
): { ok: true; value: ValidatedDecisionIntent } | { ok: false; status: 400 | 409; error: string } {
  const comment = input?.comment?.trim() ?? "";
  if (comment.length > 2_000) return { ok: false, status: 400, error: "의견은 2,000자 이내로 작성해 줘." };

  if (packet.schemaVersion === "firefly_review_packet/v1") {
    const decision = input?.decision;
    if (!decision || !manuscriptDecisions.has(decision as FireflyManuscriptDecision)) {
      return { ok: false, status: 400, error: "원고 판정값이 올바르지 않음." };
    }
    const candidate = packet.candidates.find((item) => item.id === input?.candidateId);
    if (!candidate || candidate.sha256 !== input?.candidateSha256) {
      return { ok: false, status: 409, error: "후보 원고의 해시가 검토 패킷과 다름." };
    }
    if (decision !== "approve" && !comment) {
      return { ok: false, status: 400, error: "폴리싱·보류·반려에는 작업 지시나 근거가 필요함." };
    }
    return {
      ok: true,
      value: {
        decision,
        comment,
        candidate,
        storedCandidateId: candidate.id,
        storedCandidateSha256: candidate.sha256,
      },
    };
  }

  if (packet.schemaVersion === "firefly_review_packet/v3") {
    const decision = input?.decision;
    if (!decision || !planningDecisions.has(decision as FireflyPlanningDecision)) {
      return { ok: false, status: 400, error: "기획 판정은 후보 선택·보류·탈락 중 하나여야 함." };
    }
    const candidate = packet.candidates.find((item) => item.id === input?.candidateId);
    if (!candidate || candidate.sha256 !== input?.candidateSha256) {
      return { ok: false, status: 409, error: "기획 후보의 해시가 검토 패킷과 다름." };
    }
    if (decision !== "select" && !comment) {
      return { ok: false, status: 400, error: "기획 보류·탈락에는 근거가 필요함." };
    }
    return {
      ok: true,
      value: {
        decision,
        comment,
        candidate,
        storedCandidateId: candidate.id,
        storedCandidateSha256: candidate.sha256,
      },
    };
  }

  const decision = input?.decision;
  if (!decision || !evaluationDecisions.has(decision as FireflyEvaluationDecision)) {
    return { ok: false, status: 400, error: "평가 판정은 후보 선택·동률·페어 무효 중 하나여야 함." };
  }
  if (decision === "select") {
    const candidate = packet.candidates.find((item) => item.id === input?.candidateId);
    if (!candidate || candidate.sha256 !== input?.candidateSha256) {
      return { ok: false, status: 409, error: "선택 후보의 해시가 검토 패킷과 다름." };
    }
    return {
      ok: true,
      value: {
        decision,
        comment,
        candidate,
        storedCandidateId: candidate.id,
        storedCandidateSha256: candidate.sha256,
      },
    };
  }

  if (input?.candidateId != null || input?.candidateSha256 != null) {
    return { ok: false, status: 400, error: "동률·페어 무효 판정에는 후보를 지정할 수 없음." };
  }
  if (!comment) return { ok: false, status: 400, error: "동률·페어 무효에는 근거가 필요함." };
  return {
    ok: true,
    value: {
      decision,
      comment,
      candidate: null,
      storedCandidateId: "",
      storedCandidateSha256: "",
    },
  };
}
