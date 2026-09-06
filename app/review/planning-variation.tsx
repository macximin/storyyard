import type { FireflyVariationReviewCandidateV5, FireflyVariationReviewPacketV5 } from "../firefly-variation-review-contract";
import { PlanningProjectPlan } from "./planning-evidence";

export const variationVerdictLabels = { ready: "검토 준비됨", revise: "수정 필요", reject: "반려 의견" };

export function PlanningVariationReview({ candidate, packet }: { candidate: FireflyVariationReviewCandidateV5; packet: FireflyVariationReviewPacketV5 }) {
  const review = candidate.independentReview;
  const checks = [["원문 사실", review.sourceAccuracy], ["자기 이익 우선", review.selfInterest], ["선행 조건·후속 인과", review.causalCoherence], ["사건 변주의 실질", review.variationQuality]] as const;
  return <div className="planning-entry-review">
    <section className="planning-promise">
      <p className="kicker">OPENING VARIATION</p><h3>{candidate.title}</h3>
      <p><strong>비교 기준</strong>{packet.baseline.title} · {packet.baseline.candidateId}</p>
      <p><strong>이번 범위</strong>{packet.scope.episodeStart}~{packet.scope.episodeEnd}화 · {packet.scope.through}</p>
      <p>이번에는 초반의 변주 방향을 고릅니다. 선택한 방향은 다음 전체 기획서의 기준이 됩니다.</p>
    </section>
    <PlanningProjectPlan markdown={candidate.markdown} title="초반 구간 변주안" kicker="VARIATION DETAILS" />
    <section className="commercial-promise-card">
      <p className="kicker">INDEPENDENT VARIATION REVIEW</p><h3>독립 심사 · {variationVerdictLabels[review.verdict]}</h3>
      <div className="planning-comparison-list">{checks.map(([label, check]) => <article key={label}><h4>{label} · {check.passed ? "PASS" : "FAIL"}</h4><p>{check.evidence}</p></article>)}</div>
      <h4>읽는 재미 · {review.readingPleasure.assessment}</h4><p>{review.readingPleasure.evidence}</p>
      <h4>필요한 수정</h4><p>{review.requiredRepair}</p>
    </section>
    <details className="commercial-promise-card"><summary>비교 기준·원문 근거 식별 정보</summary><dl>
      <div><dt>기준 슬레이트</dt><dd>{packet.baseline.slateId}</dd></div>
      <div><dt>기준 후보 SHA</dt><dd className="planning-evidence-hash">{packet.baseline.candidateSha256}</dd></div>
      <div><dt>기준 기획서 SHA</dt><dd className="planning-evidence-hash">{packet.baseline.planSha256}</dd></div>
      <div><dt>사용한 원문 사건</dt><dd>{candidate.sourceEventIds.join(" · ")}</dd></div>
      <div><dt>변주 후보 SHA</dt><dd className="planning-evidence-hash">{candidate.sha256}</dd></div>
    </dl></details>
  </div>;
}
