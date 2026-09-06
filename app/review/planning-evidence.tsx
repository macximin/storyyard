import { Fragment, type ReactNode } from "react";
import type { FireflyPitchReviewCandidateV3 } from "../firefly-review-contract";

// Render the planning format's headings, lists and tables as escaped React text.
// HTML and remote media in a candidate are never executed or loaded.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/u).map((part, index) => (
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code>
        : <Fragment key={index}>{part}</Fragment>
  ));
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split(/(?<!\\)\|/u).map((cell) => cell.trim().replace(/\\\|/gu, "|"));
}

export function PlanningProjectPlan({ markdown, title = "작품 기획서", kicker = "PROJECT PLAN" }: { markdown: string; title?: string; kicker?: string }) {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const key = index;
    if (/^\s*```/u.test(line)) {
      const body: string[] = [];
      for (index++; index < lines.length && !/^\s*```/u.test(lines[index]); index++) body.push(lines[index]);
      index++;
      blocks.push(<pre key={key}>{body.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      blocks.push(heading[1].length === 1 ? <h3 key={key}>{inline(heading[2])}</h3> : <h4 key={key}>{inline(heading[2])}</h4>);
      index++;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/u.test(line)) { blocks.push(<hr key={key} />); index++; continue; }
    if (line.includes("|") && index + 1 < lines.length && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/u.test(cell))) {
      const headers = cells(line);
      const rows: string[][] = [];
      for (index += 2; index < lines.length && lines[index].includes("|") && lines[index].trim(); index++) rows.push(cells(lines[index]));
      blocks.push(<div key={key} className="planning-table-scroll"><table><thead><tr>{headers.map((cell, column) => <th key={column}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const list = /^\s*(?:[-*+] |\d+\. )/u;
    if (list.test(line)) {
      const ordered = /^\s*\d+\. /u.test(line);
      const items: ReactNode[] = [];
      for (; index < lines.length && list.test(lines[index]); index++) items.push(<li key={index}>{inline(lines[index].replace(list, ""))}</li>);
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    if (/^>\s?/u.test(line)) { blocks.push(<blockquote key={key}>{inline(line.replace(/^>\s?/u, ""))}</blockquote>); index++; continue; }
    const paragraph: string[] = [line];
    for (index++; index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|\s*```|>\s?|\s*[-*+] |\s*\d+\. )/u.test(lines[index]) && !lines[index].includes("|"); index++) paragraph.push(lines[index]);
    blocks.push(<p key={key}>{inline(paragraph.join("\n"))}</p>);
  }
  return <section className="planning-project-plan commercial-promise-card">
    <p className="kicker">{kicker}</p><h3>{title}</h3>
    <div className="planning-markdown">{blocks}</div>
    <details><summary>전달받은 Markdown 원문</summary><pre className="planning-markdown-source">{markdown}</pre></details>
  </section>;
}

export function PlanningEvidence({ candidate }: { candidate: FireflyPitchReviewCandidateV3 }) {
  const spine = candidate.spineRetention;
  if (!spine) return null;
  const sourceFirst = spine.schemaVersion === "firefly_spine_retention/v2";
  return <section className="commercial-promise-card planning-source-evidence">
    <p className="kicker">REFERENCE DISCLOSURE</p><h3>원작에서 무엇을 유지하고 바꿨는가</h3>
    <dl>
      <div><dt>주축 참고작</dt><dd>{spine.referenceDisclosure.workTitle}</dd></div>
      <div><dt>선정 이유</dt><dd>{spine.referenceDisclosure.selectionReason}</dd></div>
      <div><dt>보존 요소</dt><dd>{spine.referenceDisclosure.preservedElements.join(" · ")}</dd></div>
      <div><dt>변경 요소</dt><dd>{spine.referenceDisclosure.transformedElements.join(" · ")}</dd></div>
      {candidate.sourcePremise && <>
        <div><dt>선택 전제</dt><dd>{candidate.sourcePremise.slateId}/{candidate.sourcePremise.candidateId}</dd></div>
        <div><dt>사적 욕망</dt><dd>{candidate.sourcePremise.privateWant}</dd></div>
      </>}
      <div><dt>보존 업종</dt><dd>{spine.preservedEngine.industry}</dd></div>
      <div><dt>반복 행동</dt><dd>{spine.preservedEngine.repeatedVerb}</dd></div>
      <div><dt>장기 확장</dt><dd>{spine.preservedEngine.progressionLadder}</dd></div>
      <div><dt>보상 방식</dt><dd>{spine.preservedEngine.rewardGrammar}</dd></div>
    </dl>
    {sourceFirst ? <>
      <h4>원작 기획 복원</h4>
      <dl>
        <div><dt>누구인가</dt><dd>{spine.sourceReconstruction.protagonist}</dd></div>
        <div><dt>자기 목표</dt><dd>{spine.sourceReconstruction.personalGoal}</dd></div>
        <div><dt>장기 목적</dt><dd>{spine.sourceReconstruction.longTermGoal}</dd></div>
        <div><dt>첫 전개 목적</dt><dd>{spine.sourceReconstruction.firstArcGoal}</dd></div>
        <div><dt>선택의 우선순위</dt><dd>{spine.sourceReconstruction.priorityRule}</dd></div>
        <div><dt>직접 확인한 범위</dt><dd>{spine.sourceReconstruction.verifiedScope}</dd></div>
        <div><dt>미확인·유보</dt><dd>{spine.sourceReconstruction.uncertainty}</dd></div>
      </dl>
      <h4>선택과 자기 이득의 대조</h4>
      <div className="planning-comparison-list">{spine.decisionComparisons.map((item, index) => <article key={index}>
        <p className="planning-source-location">원문 순번 {item.sourceSequenceStart}–{item.sourceSequenceEnd} · {item.sourceArcId}</p>
        <div className="planning-comparison-columns">
          <div><h5>원작</h5><p><strong>선택</strong>{item.sourceChoice}</p><p><strong>자기 이득</strong>{item.sourceGain}</p></div>
          <div><h5>후보 기획</h5><p><strong>선택</strong>{item.targetChoice}</p><p><strong>자기 이득</strong>{item.targetGain}</p></div>
        </div>
        <p><strong>보존한 인과</strong> {item.preservedReason}</p>
      </article>)}</div>
      <h4>실제 보상과 향유</h4>
      <div className="planning-comparison-list">{spine.rewards.map((reward, index) => <article key={index}>
        <h5>{reward.kind}</h5><dl>
          <div><dt>원작의 지급</dt><dd>{reward.sourceReward}</dd></div>
          <div><dt>후보의 지급</dt><dd>{reward.targetReward}</dd></div>
          <div><dt>누구의 이득인가</dt><dd>{reward.beneficiary}</dd></div>
          <div><dt>외부 목격자</dt><dd>{reward.witness ?? "해당 없음"}</dd></div>
        </dl>
      </article>)}</div>
    </> : <dl>
      <div><dt>물질 지급</dt><dd>{spine.payoffPair.material}</dd></div>
      <div><dt>감정 지급</dt><dd>{spine.payoffPair.emotional}</dd></div>
      <div><dt>지급 확인·향유</dt><dd>{spine.payoffPair.witness}</dd></div>
    </dl>}
    <h4>관계 변화</h4>
    {spine.relationshipConversion ? <p>{spine.relationshipConversion.sourceFunction} → {spine.relationshipConversion.transformedExpression}</p> : <p>해당 없음</p>}
    <h4>초반 1~4화 대응</h4>
    <div className="opening-payment-grid">{spine.openingEpisodeMappings.map((mapping) => <article key={mapping.episode}><span>후보 {mapping.episode}화 ← 원문 순번 {mapping.sourceBeatSequence} · {mapping.sourceArcId}</span><strong>{mapping.retainedFunction}</strong><p>{mapping.transformedEvent}</p></article>)}</div>
    <h4>변경에 따른 인과 조정</h4>
    <div className="planning-comparison-list">{spine.surfaceChanges.map((change, index) => <article key={index}><strong>{change.change}</strong><p>{change.causalAdjustment}</p></article>)}</div>
    {spine.hookProgression.length > 0 && <><h4>다음 사건으로 잇는 질문</h4><ul>{spine.hookProgression.map((hook, index) => <li key={index}>{hook.retainedFunction} → {hook.transformedHook} <small>({hook.sourceArcId})</small></li>)}</ul></>}
    <details><summary>원작 근거 식별 정보</summary><dl>
      <div><dt>작품 ID</dt><dd>{spine.referenceDisclosure.workSlug}</dd></div>
      <div><dt>참고 역할</dt><dd>{spine.referenceDisclosure.usageRoles.join(" · ")}</dd></div>
      <div><dt>참고 팩</dt><dd>{spine.primaryReference.packId}</dd></div>
      <div><dt>원문 SHA</dt><dd className="planning-evidence-hash">{spine.primaryReference.sourceSha256}</dd></div>
      <div><dt>참고 팩 SHA</dt><dd className="planning-evidence-hash">{spine.primaryReference.packSha256}</dd></div>
    </dl></details>
  </section>;
}

export function PlanningIndependentSourceReview({ checks }: { checks: NonNullable<FireflyPitchReviewCandidateV3["independentReview"]["sourceChecks"]> }) {
  return <section className="commercial-promise-card">
    <p className="kicker">INDEPENDENT SOURCE REVIEW</p><h3>독립 심사자의 원문 대조</h3>
    <div className="planning-comparison-list">
      <article><h4>자기 이익 우선 · {checks.selfInterest.passed ? "PASS" : "FAIL"}</h4><p>{checks.selfInterest.evidence}</p></article>
      <article><h4>원작 보존 · {checks.sourceFidelity.passed ? "PASS" : "FAIL"}</h4><p>{checks.sourceFidelity.evidence}</p></article>
      <article><h4>읽는 재미 · {checks.commercialReading.assessment}</h4><p>{checks.commercialReading.evidence}</p></article>
    </div>
  </section>;
}
