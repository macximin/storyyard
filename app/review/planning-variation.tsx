import type { FireflyVariationReviewCandidateV5, FireflyVariationReviewPacketV5 } from "../firefly-variation-review-contract";
import type { PlanningBaselineView } from "../firefly-planning-baseline";
import type { PlanningDocument } from "../firefly-planning-documents";
import { PlanningProjectPlan, planningSectionTitles } from "./planning-evidence";

export const variationVerdictLabels = { ready: "검토 준비됨", revise: "수정 필요", reject: "반려 의견" };

// These links describe reading relationships, not applied edits or a new plan.
const relatedVariationSections: Record<number, string[]> = {
  1: ["초반 이야기", "첫 투자와 회수"],
  2: ["초반 이야기", "배치와 남은 판단"],
  3: ["도입 4화", "첫 투자와 회수"],
  4: ["초반 이야기", "사건을 어떻게 바꾸는가"],
  5: ["배치와 남은 판단", "사건을 어떻게 바꾸는가"],
  6: ["초반 이야기", "도입 4화"],
  7: ["첫 투자와 회수", "도입 4화"],
  8: ["사건을 어떻게 바꾸는가", "실제 원문 근거"],
  9: ["배치와 남은 판단"],
};

export function PlanningVariationReview({ candidate, packet, baseline, document }: {
  candidate: FireflyVariationReviewCandidateV5; packet: FireflyVariationReviewPacketV5; baseline?: PlanningBaselineView; document?: PlanningDocument;
}) {
  const review = candidate.independentReview;
  const variationPrefix = `variation-${packet.packetId}-${candidate.id}`;
  const baselinePrefix = `baseline-${packet.packetId}-${candidate.id}`;
  const titles = planningSectionTitles(candidate.markdown);
  const sectionLinks = Object.entries(relatedVariationSections).flatMap(([number, related]) => related.flatMap((title) => {
    const index = titles.indexOf(title);
    return index < 0 ? [] : [{ sectionNumber: Number(number), label: title, href: `#${variationPrefix}-${index}` }];
  }));
  const checks = [["원문 사실", review.sourceAccuracy], ["자기 이익 우선", review.selfInterest], ["선행 조건·후속 인과", review.causalCoherence], ["사건 변주의 실질", review.variationQuality]] as const;
  const completePlan = document?.projectPlan.markdown ?? (/^#{1,2}\s+9\./mu.test(candidate.markdown) ? candidate.markdown : undefined);
  if (completePlan) return <div className="planning-entry-review">
    <PlanningProjectPlan markdown={completePlan} title={candidate.title} idPrefix={`project-plan-${packet.packetId}-${candidate.id}`} />
    <details className="commercial-promise-card">
      <summary>독립 심사 · {variationVerdictLabels[review.verdict]}</summary>
      {packet.recommendation?.candidateId === candidate.id && <p>{packet.recommendation.reason}</p>}
      <div className="planning-comparison-list">{checks.map(([label, check]) => <article key={label}><h4>{label} · {check.passed ? "PASS" : "FAIL"}</h4><p>{check.evidence}</p></article>)}</div>
      <h4>읽는 재미 · {review.readingPleasure.assessment}</h4><p>{review.readingPleasure.evidence}</p>
      <h4>필요한 수정</h4><p>{review.requiredRepair}</p>
    </details>
  </div>;
  return <div className="planning-entry-review">
    <section className="planning-promise">
      <p className="kicker">OPENING VARIATION</p><h3>{candidate.title}</h3>
      <p><strong>비교 기준</strong>{packet.baseline.title} · {packet.baseline.candidateId}</p>
      <p><strong>이번 범위</strong>{packet.scope.episodeStart}~{packet.scope.episodeEnd}화 · {packet.scope.through}</p>
      <p>이번에는 초반의 변주 방향을 고릅니다. 선택한 방향은 다음 전체 기획서의 기준이 됩니다.</p>
      <nav className="ff-planning-document-nav" aria-label="기획서와 수정안 이동">
        <a href={`#${variationPrefix}`}>이번 초반 수정안</a>
        {baseline && <a href={`#${baselinePrefix}`}>이전 기준안 · 육하원칙</a>}
      </nav>
    </section>
    <div id={variationPrefix} className="ff-planning-variation-document">
      <aside className="ff-planning-baseline-notice"><strong>검토 중인 초반 수정안 · {candidate.title}</strong><p>이하 내용은 도입 {packet.scope.episodeStart}~{packet.scope.episodeEnd}화의 수정 제안입니다. 아래 판정도 이 변주 후보를 대상으로 합니다.</p><p>현재 전체 기획서는 아직 통합 전입니다. 이전 기획서는 아래 접힌 참고에서 확인할 수 있습니다.</p></aside>
      <PlanningProjectPlan markdown={candidate.markdown} title="초반 구간 변주안" kicker="VARIATION DETAILS" idPrefix={variationPrefix} referenceSections={["사건을 어떻게 바꾸는가", "실제 원문 근거"]} />
    </div>
    {baseline ? <div id={baselinePrefix} className="ff-planning-baseline">
      <details className="commercial-promise-card">
      <summary>이전 기준안 · 육하원칙과 9절 기획서 · 수정 전 참고</summary>
      <aside className="ff-planning-baseline-notice">
        <strong>이전 전체 기획서 · 현재안 아님</strong>
        <p>변주 전 기록입니다. 교체되거나 제외된 사건도 포함되어 있습니다. 각 절의 관련 수정안으로 이동해 비교할 수 있습니다.</p>
        <p>아래 기준안의 인물·연대·장기 전개에는 이번 변주가 아직 반영되지 않았습니다. 통합 기획서는 방향 선택 후 같은 양식으로 작성합니다.</p>
        {baseline.reviewHref && <a href={baseline.reviewHref}>이전 기획서 검토 화면 열기</a>}
      </aside>
      <PlanningProjectPlan markdown={baseline.markdown} title="이전 전체 기획서 · 수정 전 참고" idPrefix={`${baselinePrefix}-section`} sectionLinks={sectionLinks} />
      </details>
    </div> : <aside className="ff-planning-baseline-notice"><strong>기준 전체 기획서를 불러올 수 없습니다.</strong><p>현재는 초반 변주안만 표시합니다. 제목이 같은 다른 기획서로 대신하지 않습니다.</p></aside>}
    <details className="commercial-promise-card">
      <summary>독립 심사 · {variationVerdictLabels[review.verdict]}</summary>
      {packet.recommendation?.candidateId === candidate.id && <p>{packet.recommendation.reason}</p>}
      <div className="planning-comparison-list">{checks.map(([label, check]) => <article key={label}><h4>{label} · {check.passed ? "PASS" : "FAIL"}</h4><p>{check.evidence}</p></article>)}</div>
      <h4>읽는 재미 · {review.readingPleasure.assessment}</h4><p>{review.readingPleasure.evidence}</p>
      <h4>필요한 수정</h4><p>{review.requiredRepair}</p>
    </details>
    <details className="commercial-promise-card"><summary>비교 기준·원문 근거 식별 정보</summary><dl>
      <div><dt>기준 슬레이트</dt><dd>{packet.baseline.slateId}</dd></div>
      <div><dt>기준 후보 SHA</dt><dd className="planning-evidence-hash">{packet.baseline.candidateSha256}</dd></div>
      <div><dt>기준 기획서 SHA</dt><dd className="planning-evidence-hash">{packet.baseline.planSha256}</dd></div>
      <div><dt>사용한 원문 사건</dt><dd>{candidate.sourceEventIds.join(" · ")}</dd></div>
      <div><dt>변주 후보 SHA</dt><dd className="planning-evidence-hash">{candidate.sha256}</dd></div>
    </dl></details>
  </div>;
}
