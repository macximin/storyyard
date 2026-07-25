"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Clock, FileText, LockKey, WarningCircle, X } from "@phosphor-icons/react";
import { GlobalSidebar, SidebarUser } from "@/app/global-sidebar";
import type { CanonArtifact, CanonDecisionValue, CanonPackage } from "@/app/canon-packages";
import { formatCanonDecisionTime } from "./decision-time";

type DecisionRow = {
  id: string;
  workSlug: string;
  bundleSha256: string;
  artifactKey: string;
  artifactSha256: string;
  decision: string;
  comment: string;
  actorEmail: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  applyReceiptPath: string | null;
};

type ViewKey = "overview" | "frozen_pitch" | "living_spine" | "a_rail" | "b_rail" | "rolling_corridor" | "manuscripts" | "adoption_review" | "narrative_state";

const decisionLabels: Record<CanonDecisionValue, string> = {
  approve: "승인",
  conditional: "조건부 승인",
  revise: "수정 요청",
  reject: "반려",
};

const decisionDescriptions: Record<CanonDecisionValue, string> = {
  approve: "현재 해시 그대로 다음 적용 검토",
  conditional: "조건 충족 후 적용 검토",
  revise: "Foundry에서 수정한 새 스냅샷 필요",
  reject: "현재 후보를 적용 대상에서 제외",
};

const viewLabels: Array<[ViewKey, string]> = [
  ["overview", "대시보드"],
  ["frozen_pitch", "Frozen Pitch"],
  ["living_spine", "Living Spine"],
  ["a_rail", "A-Rail"],
  ["b_rail", "B-Rail"],
  ["rolling_corridor", "Rolling Corridor"],
  ["manuscripts", "승인 원고"],
  ["adoption_review", "승격 근거"],
  ["narrative_state", "상태 스냅샷"],
];

export function CanonReviewBoard({
  user,
  canonPackages,
  initialDecisionSets,
}: {
  user: Exclude<SidebarUser, null>;
  canonPackages: CanonPackage[];
  initialDecisionSets: Record<string, DecisionRow[]>;
}) {
  const [activeWorkSlug, setActiveWorkSlug] = useState(canonPackages[0]?.workSlug ?? "");
  const canonPackage = canonPackages.find((item) => item.workSlug === activeWorkSlug) ?? canonPackages[0];
  const [view, setView] = useState<ViewKey>("overview");
  const [episode, setEpisode] = useState<"ep001" | "ep002" | "ep003">("ep001");
  const [selectedKey, setSelectedKey] = useState("__bundle__");
  const [selectedDecision, setSelectedDecision] = useState<CanonDecisionValue>("approve");
  const [comment, setComment] = useState("");
  const [histories, setHistories] = useState(initialDecisionSets);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const history = histories[canonPackage.workSlug] ?? [];

  const artifacts = useMemo(
    () => Object.fromEntries(canonPackage.artifacts.map((artifact) => [artifact.key, artifact])),
    [canonPackage.artifacts],
  );
  const selectedArtifact = selectedKey === "__bundle__" ? null : artifacts[selectedKey];
  const selectedSha = selectedArtifact?.sha256 ?? canonPackage.bundleSha256;
  const selectedLabel = selectedArtifact?.label ?? "전체 캐논 패키지";
  const bArcCounts = canonPackage.bArcs.reduce<Record<string, number>>((counts, arc) => {
    counts[arc.status] = (counts[arc.status] ?? 0) + 1;
    return counts;
  }, {});

  function openView(nextView: ViewKey) {
    setView(nextView);
    if (nextView === "overview") setSelectedKey("__bundle__");
    else if (nextView === "manuscripts") setSelectedKey(episode);
    else setSelectedKey(nextView);
    setMessage("");
  }

  function selectWork(workSlug: string) {
    setActiveWorkSlug(workSlug);
    setView("overview");
    setSelectedKey("__bundle__");
    setEpisode("ep001");
    setMessage("");
  }

  function selectEpisode(nextEpisode: "ep001" | "ep002" | "ep003") {
    setEpisode(nextEpisode);
    setSelectedKey(nextEpisode);
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/canon/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workSlug: canonPackage.workSlug,
          bundleSha256: canonPackage.bundleSha256,
          artifactKey: selectedKey,
          artifactSha256: selectedSha,
          decision: selectedDecision,
          comment,
        }),
      });
      const data = await response.json() as { decision?: DecisionRow; error?: string };
      if (!response.ok || !data.decision) {
        setMessage(data.error || "판정을 기록하지 못했음.");
        return;
      }
      setHistories((current) => ({
        ...current,
        [canonPackage.workSlug]: [data.decision!, ...(current[canonPackage.workSlug] ?? []).filter((row) => row.id !== data.decision!.id)],
      }));
      setComment("");
      setMessage("판정을 pending으로 기록했음. Foundry에는 아직 반영되지 않음.");
    } catch {
      setMessage("연결 문제로 판정을 기록하지 못했음.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="library-shell canon-shell">
      <GlobalSidebar user={user} active="canon" />
      <section className="canon-main">
        <nav className="canon-work-switcher" aria-label="확인할 작품">
          {canonPackages.map((item) => <button type="button" key={item.workSlug} className={item.workSlug === canonPackage.workSlug ? "active" : ""} onClick={() => selectWork(item.workSlug)}><strong>{item.title}</strong><span>{item.sourceState === "working_tree" ? "승격 준비 스냅샷" : "커밋 정본"}</span></button>)}
        </nav>
        <header className="canon-hero">
          <div>
            <p className="kicker">HUMAN CANON REVIEW · READ SNAPSHOT</p>
            <h1>{canonPackage.title}</h1>
            <p>Foundry 정본을 읽고 사람의 판정을 남기는 확인판. 여기서 원고나 Story Plan을 직접 고치지 않습니다.</p>
          </div>
          <div className="canon-lock"><LockKey size={18} /><strong>Foundry SSOT</strong><span>{canonPackage.sourceState === "working_tree" ? "동기화 잠김" : "자동 승격 꺼짐"}</span></div>
        </header>

        <div className="canon-integrity">
          <span><Check size={15} weight="bold" /> {canonPackage.sourceState === "working_tree" ? "작업 스냅샷" : "커밋 스냅샷"} {canonPackage.sourceUpdatedAt}</span>
          <code>{canonPackage.sourceState === "working_tree" ? "base" : "source"} {canonPackage.sourceGitCommit.slice(0, 12)}…</code>
          <code>bundle {canonPackage.bundleSha256.slice(0, 12)}…</code>
          <code>revision {canonPackage.revisionSetSha256.slice(0, 12)}…</code>
        </div>

        <nav className="canon-tabs" aria-label="캐논 확인 영역">
          {viewLabels.map(([key, label]) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => openView(key)}>{label}</button>
          ))}
        </nav>

        <div className="canon-workarea">
          <section className="canon-content">
            {view === "overview" && (
              <>
                <div className="canon-status-grid">
                  <StatusCard label="제작 단계" value={canonPackage.status.productionStage} detail={`현재 ${canonPackage.status.currentEpisode}`} />
                  <StatusCard label="승인 원고" value={`${canonPackage.status.approvedThrough}까지`} detail={`감리 ${canonPackage.status.reviewedThrough}`} />
                  <StatusCard label="현재 B" value={canonPackage.status.currentBArc} detail="한 아크 최대 5화" />
                  <StatusCard label="다음 작업" value={canonPackage.status.currentEpisode} detail={canonPackage.status.nextAction} />
                </div>
                <section className="canon-section">
                  <div className="canon-section-head"><div><p className="kicker">STORY PLAN MODEL</p><h2>장기 방향과 단기 확정을 분리</h2></div></div>
                  <div className="canon-flow">
                    <article><span>01</span><strong>Living Spine</strong><p>변하지 않는 작품 약속과 엔진</p></article>
                    <article><span>02</span><strong>A-Rail</strong><p>장기 도착점. 화수는 가변 band</p></article>
                    <article className="active"><span>03</span><strong>B-Rail</strong><p>1~5화 단위 아크. 현재 {canonPackage.status.currentBArc}</p></article>
                    <article><span>04</span><strong>Rolling Corridor</strong><p>현재 B와 다음 B만 구체화</p></article>
                  </div>
                </section>
                <section className="canon-section">
                  <div className="canon-section-head"><div><p className="kicker">SCOPE</p><h2>이번 확인판의 경계</h2></div></div>
                  <div className="scope-columns">
                    <div><strong>포함</strong>{canonPackage.scope.includes.map((item) => <span key={item}>+ {item}</span>)}</div>
                    <div><strong>제외</strong>{canonPackage.scope.excludes.map((item) => <span key={item}>− {item}</span>)}</div>
                  </div>
                </section>
              </>
            )}

            {view === "a_rail" && (
              <section className="canon-section no-top">
                <div className="canon-section-head">
                  <div><p className="kicker">A-RAIL · LONG HORIZON</p><h2>{canonPackage.anchors.length}개 장기 앵커</h2><p>도착점은 보존하되, 실제 승인 원고에 맞춰 band와 중간 경로는 다시 계산합니다.</p></div>
                </div>
                <div className="anchor-grid">
                  {canonPackage.anchors.map((anchor) => (
                    <article key={anchor.id} className={anchor.status.includes("complete") ? "complete" : anchor.status === "compound" ? "active" : ""}>
                      <header><span>{anchor.id}</span><em>{anchor.status}</em></header>
                      <h3>{anchor.label.replace(/^A\d{2}\s*/, "")}</h3>
                      <dl><dt>trigger</dt><dd>{anchor.trigger}</dd><dt>비가역 환전</dt><dd>{anchor.irreversibleExchange}</dd><dt>다음 압력</dt><dd>{anchor.nextPressure}</dd></dl>
                    </article>
                  ))}
                </div>
                <details className="canon-source-details">
                  <summary>정본 원문 보기</summary>
                  <ArtifactReader artifact={artifacts.a_rail} />
                </details>
              </section>
            )}

            {view === "b_rail" && (
              <section className="canon-section no-top">
                <div className="canon-section-head">
                  <div><p className="kicker">B-RAIL · ROUTE CAPACITY</p><h2>{canonPackage.bArcs.length}개 가변 아크 슬롯</h2><p>현재·다음만 실행 후보입니다. hypothesis는 결말까지의 용량 골격이지 확정 연표가 아닙니다.</p></div>
                  <div className="rail-counts"><span>closed {bArcCounts.closed ?? 0}</span><span>active {bArcCounts.active ?? 0}</span><span>provisional {bArcCounts.provisional ?? 0}</span><span>hypothesis {bArcCounts.hypothesis ?? 0}</span></div>
                </div>
                <div className="b-rail-list">
                  {canonPackage.bArcs.map((arc) => (
                    <article key={arc.id} className={`rail-${arc.status}`}>
                      <header><strong>{arc.id}</strong><span>{arc.targetAnchor}</span><em>{arc.status}</em></header>
                      <p>{arc.narrativeFunction}</p>
                      <footer><span>보상 · {arc.payoffAxis}</span><span>대비 · {arc.contrast}</span></footer>
                    </article>
                  ))}
                </div>
                <details className="canon-source-details">
                  <summary>정본 원문 보기</summary>
                  <ArtifactReader artifact={artifacts.b_rail} />
                </details>
              </section>
            )}

            {view === "manuscripts" && (
              <section className="canon-section no-top">
                <div className="canon-section-head">
                  <div><p className="kicker">OWNER-APPROVED MANUSCRIPT</p><h2>정확한 승인 원고</h2><p>manifest SHA-256과 일치하는 1~3화 스냅샷입니다.</p></div>
                </div>
                <div className="episode-switcher">
                  {(["ep001", "ep002", "ep003"] as const).map((key) => (
                    <button key={key} className={episode === key ? "active" : ""} onClick={() => selectEpisode(key)}>
                      {key.replace("ep00", "")}화 <code>{artifacts[key].sha256.slice(0, 8)}</code>
                    </button>
                  ))}
                </div>
                <ArtifactReader artifact={artifacts[episode]} />
              </section>
            )}

            {view !== "overview" && view !== "a_rail" && view !== "b_rail" && view !== "manuscripts" && (
              <section className="canon-section no-top">
                <ArtifactReader artifact={artifacts[view]} />
              </section>
            )}
          </section>

          <aside className="canon-review-panel">
            <div className="review-panel-sticky">
              <p className="kicker">HUMAN DECISION</p>
              <h2>{selectedLabel}</h2>
              <code>{selectedSha.slice(0, 16)}…</code>
              <form onSubmit={submitDecision}>
                <fieldset>
                  <legend>판정</legend>
                  {(Object.keys(decisionLabels) as CanonDecisionValue[]).map((value) => (
                    <label key={value} className={selectedDecision === value ? `selected ${value}` : ""}>
                      <input type="radio" name="decision" value={value} checked={selectedDecision === value} onChange={() => setSelectedDecision(value)} />
                      <span><strong>{decisionLabels[value]}</strong><small>{decisionDescriptions[value]}</small></span>
                    </label>
                  ))}
                </fieldset>
                <label className="review-comment">
                  <span>근거 / 수정 조건</span>
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder={selectedDecision === "approve" ? "승인은 메모 없이도 기록 가능" : "필수: 구체적인 근거와 수정 조건"} />
                  <small>{comment.length} / 2,000</small>
                </label>
                <button className="black-button" disabled={pending}>{pending ? "기록 중…" : "pending 판정 기록"}</button>
              </form>
              {message && <p className="review-message" role="status">{message}</p>}
              <div className="pending-notice"><Clock size={17} /><span><strong>적용 대기열</strong>이 판정은 Foundry를 바꾸지 않습니다.</span></div>

              <section className="decision-history">
                <h3>최근 판정</h3>
                {history.length === 0 ? <p>아직 기록된 판정이 없습니다.</p> : history.slice(0, 8).map((row) => (
                  <article key={row.id}>
                    <header>
                      {row.decision === "approve" ? <Check size={14} /> : row.decision === "reject" ? <X size={14} /> : <WarningCircle size={14} />}
                      <strong>{decisionLabels[row.decision as CanonDecisionValue] ?? row.decision}</strong>
                      <span>{row.status}</span>
                    </header>
                    <p>{row.artifactKey === "__bundle__" ? "전체 패키지" : artifacts[row.artifactKey]?.label ?? row.artifactKey}</p>
                    {row.comment && <blockquote>{row.comment}</blockquote>}
                    <time>{formatCanonDecisionTime(row.createdAt)}</time>
                  </article>
                ))}
              </section>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ArtifactReader({ artifact }: { artifact: CanonArtifact }) {
  return (
    <>
      <div className="canon-section-head">
        <div><p className="kicker">{artifact.kind.toUpperCase()}</p><h2>{artifact.label}</h2><p>{artifact.sourcePath}</p></div>
        <div className="artifact-authority"><FileText size={16} /><span>{artifact.authority}</span></div>
      </div>
      <div className="artifact-hash"><span>SHA-256</span><code>{artifact.sha256}</code></div>
      <pre className="canon-document">{artifact.body}</pre>
    </>
  );
}
