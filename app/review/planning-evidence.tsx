import { Fragment, useId, type ReactNode } from "react";
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

// Only explicit production vocabulary becomes a note. Story facts, dates,
// figures and uncertainty remain available, including the untouched source.
function productionAnnotation(text: string): boolean {
  return /비정본|정본|승격|ArcPacket|NarrativeArc|\b(?:Book|Story Frame|Rail|railA|railB|pending|projectPlan)\b|생성자 자기점수|내부 설계 평가|이번 턴|이번 직접 본문 범위/u.test(text);
}

function sentences(text: string): string[] {
  // A period within a decimal, field path or array coordinate is not a break.
  return text.split(/(?<=[.!?])\s+/u).map((part) => part.trim()).filter(Boolean);
}

function readableParagraphs(text: string): string[] {
  if (text.length < 220) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences(text)) {
    if (current && current.length + sentence.length > 220) { chunks.push(current); current = ""; }
    current += (current ? " " : "") + sentence;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

function planBlocks(markdown: string): { content: ReactNode[]; notes: ReactNode[] } {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const content: ReactNode[] = [];
  const notes: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const key = index;
    if (/^\s*```/u.test(line)) {
      const body: string[] = [];
      for (index++; index < lines.length && !/^\s*```/u.test(lines[index]); index++) body.push(lines[index]);
      index++;
      content.push(<pre key={key}>{body.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) { content.push(<h5 key={key}>{inline(heading[2])}</h5>); index++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/u.test(line)) { content.push(<hr key={key} />); index++; continue; }
    if (line.includes("|") && index + 1 < lines.length && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/u.test(cell))) {
      const headers = cells(line);
      const rows: string[][] = [];
      for (index += 2; index < lines.length && lines[index].includes("|") && lines[index].trim(); index++) rows.push(cells(lines[index]));
      const noteColumns = headers.map((header, column) => /^(?:원작 대응|근거 상태)$/u.test(header) ? column : -1).filter((column) => column >= 0);
      const visibleColumns = headers.map((_, column) => column).filter((column) => !noteColumns.includes(column));
      // A table made entirely of evidence still needs its column headings.
      const columns = visibleColumns.length ? visibleColumns : headers.map((_, column) => column);
      content.push(<div key={key} className="planning-table-scroll ff-plan-table-cards"><table><thead><tr>{columns.map((column) => <th key={column} scope="col">{inline(headers[column])}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column, displayIndex) => <td key={column} data-label={headers[column]}>
        {readableParagraphs(row[column] ?? "").map((part, partIndex) => <p key={partIndex}>{inline(part)}</p>)}
        {displayIndex === 0 && visibleColumns.length > 0 && noteColumns.length > 0 && <details className="ff-plan-note"><summary>원작·검토 주석</summary><dl>{noteColumns.map((noteColumn) => <div key={noteColumn}><dt>{headers[noteColumn]}</dt><dd>{inline(row[noteColumn] ?? "")}</dd></div>)}</dl></details>}
      </td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const list = /^\s*(?:[-*+] |\d+\. )/u;
    if (list.test(line)) {
      const ordered = /^\s*\d+\. /u.test(line);
      const items: ReactNode[] = [];
      for (; index < lines.length && list.test(lines[index]); index++) items.push(<li key={index}>{inline(lines[index].replace(list, ""))}</li>);
      content.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    if (/^>\s?/u.test(line)) { content.push(<blockquote key={key}>{inline(line.replace(/^>\s?/u, ""))}</blockquote>); index++; continue; }
    const paragraph: string[] = [line];
    for (index++; index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|\s*```|>\s?|\s*[-*+] |\s*\d+\. )/u.test(lines[index]) && !lines[index].includes("|"); index++) paragraph.push(lines[index]);
    const text = paragraph.join("\n");
    if (productionAnnotation(text)) {
      // Preserve ordinary sentences from a mixed paragraph in the reading view.
      const parts = sentences(text);
      const story = parts.filter((part) => !productionAnnotation(part));
      const annotations = parts.filter(productionAnnotation);
      for (const [partIndex, part] of readableParagraphs(story.join(" ")).entries()) if (part) content.push(<p key={`${key}-story-${partIndex}`}>{inline(part)}</p>);
      annotations.forEach((part, partIndex) => notes.push(<p key={`${key}-note-${partIndex}`}>{inline(part)}</p>));
    } else {
      readableParagraphs(text).forEach((part, partIndex) => content.push(<p key={`${key}-${partIndex}`}>{inline(part)}</p>));
    }
  }
  return { content, notes };
}

export function planningSectionTitles(markdown: string): string[] {
  return splitPlanningSections(markdown).map((section) => section.title);
}

function splitPlanningSections(markdown: string): Array<{ title: string; lines: string[] }> {
  const sections: Array<{ title: string; lines: string[] }> = [];
  let inCode = false;
  for (const line of markdown.replace(/\r\n/gu, "\n").split("\n")) {
    if (/^\s*```/u.test(line)) inCode = !inCode;
    const heading = !inCode && /^#{1,2}\s+(.+)$/u.exec(line);
    if (heading) sections.push({ title: heading[1], lines: [] });
    else {
      if (!sections.length) sections.push({ title: "", lines: [] });
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

export function PlanningProjectPlan({ markdown, title = "작품 기획서", kicker = "PROJECT PLAN", idPrefix, sectionLinks = [], referenceSections = [] }: {
  markdown: string; title?: string; kicker?: string; idPrefix?: string;
  sectionLinks?: Array<{ sectionNumber: number; label: string; href: string }>;
  referenceSections?: string[];
}) {
  const uniqueId = useId();
  const prefix = idPrefix ?? `plan-${uniqueId.replace(/[^a-zA-Z0-9_-]/gu, "")}`;
  const sections = splitPlanningSections(markdown);
  const numbered = sections.filter((section) => section.title);
  return <section className="planning-project-plan commercial-promise-card">
    <p className="kicker">{kicker === "PROJECT PLAN" ? "작품 기획" : kicker}</p><h3>{title}</h3>
    {numbered.length > 1 && <nav className="ff-plan-nav" aria-label={`${title} 목차`}>{sections.map((section, index) => (section.title && (index > 0 || /^\d+\./u.test(section.title))) && <a key={index} href={`#${prefix}-${index}`}>{referenceSections.includes(section.title) ? `이전·원문 비교 참고 · ${section.title}` : section.title}</a>)}</nav>}
    <div className="planning-markdown ff-plan-body">{sections.map((section, index) => {
      const rendered = planBlocks(section.lines.join("\n"));
      const heading = /^(\d+)\.\s*(.*)$/u.exec(section.title);
      const reference = referenceSections.includes(section.title);
      const content = <section key={index} id={reference ? undefined : `${prefix}-${index}`} className="ff-plan-section">
        {section.title && <header className="ff-plan-section-head">{heading && <span className="ff-plan-section-number" aria-hidden="true">{heading[1].padStart(2, "0")}</span>}{index === 0 && !heading ? <p className="ff-plan-section-subtitle">{inline(section.title)}</p> : <h4>{heading ? heading[2] : section.title}</h4>}</header>}
        {heading && sectionLinks.some((link) => link.sectionNumber === Number(heading[1])) && <aside className="ff-plan-revision-links" aria-label={`${section.title} 관련 수정안`}>
          <strong>기준안 · 수정 전</strong><span>관련 수정안:</span>{sectionLinks.filter((link) => link.sectionNumber === Number(heading[1])).map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </aside>}
        {rendered.content}
        {rendered.notes.length > 0 && <details className="ff-plan-note ff-plan-notes"><summary>제작·검토 주석 {rendered.notes.length}개</summary>{rendered.notes}</details>}
      </section>;
      return reference ? <details key={index} id={`${prefix}-${index}`} className="ff-plan-reference"><summary>이전·원문 비교 참고 · {section.title}</summary><p>아래에는 교체 전 사건과 원작 내용이 함께 나옵니다.</p>{content}</details> : content;
    })}</div>
    <details className="ff-plan-note"><summary>전체 원문 · 주석 포함</summary><pre className="planning-markdown-source">{markdown}</pre></details>
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

function SourceReviewText({ text }: { text: string }) {
  const paragraphs = text.split(/\s+(?=[①-⑳])/u).flatMap(readableParagraphs);
  return <div className="ff-plan-evidence-text">{paragraphs.map((paragraph, index) => <p key={index}>{inline(paragraph)}</p>)}<details className="ff-plan-note"><summary>심사 원문 그대로 보기</summary><pre className="planning-markdown-source">{text}</pre></details></div>;
}

export function PlanningIndependentSourceReview({ checks }: { checks: NonNullable<FireflyPitchReviewCandidateV3["independentReview"]["sourceChecks"]> }) {
  return <section className="commercial-promise-card">
    <p className="kicker">심사 근거</p><h3>독립 심사자의 원문 대조</h3>
    <div className="planning-comparison-list ff-plan-checks">
      <article><h4>자기 이익 우선 · {checks.selfInterest.passed ? "PASS" : "FAIL"}</h4><details className="ff-plan-note"><summary>판정 근거 펼치기</summary><SourceReviewText text={checks.selfInterest.evidence} /></details></article>
      <article><h4>원작 보존 · {checks.sourceFidelity.passed ? "PASS" : "FAIL"}</h4><details className="ff-plan-note"><summary>원문 대조 내역 펼치기</summary><SourceReviewText text={checks.sourceFidelity.evidence} /></details></article>
      <article><h4>읽는 재미</h4><p>{checks.commercialReading.assessment}</p><details className="ff-plan-note"><summary>상업성 판단 근거 펼치기</summary><SourceReviewText text={checks.commercialReading.evidence} /></details></article>
    </div>
  </section>;
}
