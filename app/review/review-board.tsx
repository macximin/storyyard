"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, Clock, Eye, LockKey, MagicWand, Pause, ShieldCheck, X } from "@phosphor-icons/react";
import { GlobalSidebar, SidebarUser } from "@/app/global-sidebar";
import type { FireflyDecision, FireflyReviewPacket, FireflySurfaceMatch, SurfaceClassification } from "@/app/firefly-review-packets";

type DecisionRow = { decisionId: string; candidateId: string; decision: string; comment: string; status: string; createdAt: string };
const labels: Record<FireflyDecision, string> = { approve: "이 후보 승인", polish: "폴리싱 요청", hold: "보류", reject: "반려" };
const icons = { approve: Check, polish: MagicWand, hold: Pause, reject: X };
const classificationLabels: Record<SurfaceClassification, string> = {
  engine: "상업 엔진·사건 기능",
  "genre-convention": "일반 장르 관습",
  "source-surface": "원천 고유 표면",
  "canon-leak": "캐논 유입",
};
const commercialLabels: Record<string, string> = {
  openingPressure: "오프닝 압력", protagonistAgency: "주인공 선택", resistanceQuality: "저항의 질",
  visiblePayoff: "가시적 지급", endingPropulsion: "화말 추진력", referenceEngineRetention: "엔진 유지",
  transformationIntegrity: "변형 정합성", styleFidelity: "문체 충실도",
};

export function FireflyReviewBoard({ user, packets, completedCount, initialDecisions }: {
  user: Exclude<SidebarUser, null>;
  packets: FireflyReviewPacket[];
  completedCount: number;
  initialDecisions: Record<string, DecisionRow[]>;
}) {
  const [packetIndex, setPacketIndex] = useState(0);
  const packet = packets[packetIndex] ?? null;
  const [candidateId, setCandidateId] = useState(packets[0]?.candidates[0]?.id ?? "");
  const candidate = packet?.candidates.find((item) => item.id === candidateId) ?? packet?.candidates[0] ?? null;
  const [decision, setDecision] = useState<FireflyDecision>("approve");
  const [comment, setComment] = useState("");
  const [histories, setHistories] = useState(initialDecisions);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [classifications, setClassifications] = useState<Record<string, SurfaceClassification>>({});
  const [sourceSlices, setSourceSlices] = useState<Record<string, { status: "loading" | "ready" | "error"; body?: string; message?: string }>>({});

  const allMatches = packet?.schemaVersion === "firefly_review_packet/v2"
    ? packet.candidates.flatMap((item) => item.review.surfaceComparison.surfaceMatches)
    : [];
  const classifiedCount = allMatches.filter((match) => classifications[match.matchId]).length;

  if (!packet || !candidate) {
    return <main className="library-shell firefly-review-shell">
      <GlobalSidebar user={user} active="review" />
      <section className="firefly-review-main">
        <header className="review-queue-head">
          <div><p className="kicker">FIREFLY HUMAN REVIEW</p><h1>오늘 검토</h1><p>재미와 도파민을 먼저 보고, 정합성은 치명적인 모순만 막습니다.</p></div>
          <div className="review-authority"><LockKey size={18} /><strong>정본은 InkOS</strong><span>Storyyard는 판정만 기록</span></div>
        </header>
        <section className="review-empty-state">
          <Check size={28} />
          <h2>검토 대기 없음</h2>
          <p>InkOS 적용 영수증까지 확인된 패킷은 활성 큐에서 자동 종료됩니다.</p>
          {completedCount > 0 && <span>종료된 패킷 {completedCount}개</span>}
        </section>
      </section>
    </main>;
  }

  function selectPacket(index: number) {
    setPacketIndex(index);
    setCandidateId(packets[index]?.candidates[0]?.id ?? "");
    setClassifications({});
    setSourceSlices({});
    setMessage("");
  }

  async function openSourceSlice(match: FireflySurfaceMatch) {
    setSourceSlices((current) => ({ ...current, [match.matchId]: { status: "loading" } }));
    try {
      const response = await fetch("/api/firefly/source-slices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ packetId: packet.packetId, packetSha256: packet.packetSha256, matchId: match.matchId }),
      });
      const body = await response.text();
      if (!response.ok) {
        let error = "원문 구간을 불러오지 못했음.";
        try { error = (JSON.parse(body) as { error?: string }).error ?? error; } catch { /* no raw fallback */ }
        setSourceSlices((current) => ({ ...current, [match.matchId]: { status: "error", message: error } }));
        return;
      }
      setSourceSlices((current) => ({ ...current, [match.matchId]: { status: "ready", body } }));
      window.setTimeout(() => setSourceSlices((current) => {
        const next = { ...current };
        delete next[match.matchId];
        return next;
      }), 10 * 60 * 1000);
    } catch {
      setSourceSlices((current) => ({ ...current, [match.matchId]: { status: "error", message: "private resolver 연결을 확인해 줘." } }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/firefly/review-decisions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ packetId: packet.packetId, packetSha256: packet.packetSha256,
          candidateId: candidate.id, candidateSha256: candidate.sha256, decision, comment,
          ...(packet.schemaVersion === "firefly_review_packet/v2" ? {
            surfaceClassifications: allMatches.map((match) => ({
              matchId: match.matchId,
              selectorSha256: match.selectorSha256,
              classification: classifications[match.matchId],
            })),
          } : {}),
        }),
      });
      const data = await response.json() as { decision?: DecisionRow; error?: string };
      if (!response.ok || !data.decision) { setMessage(data.error || "판정을 기록하지 못했음."); return; }
      setHistories((current) => ({ ...current, [packet.packetId]: [data.decision!, ...(current[packet.packetId] ?? []).filter((row) => row.decisionId !== data.decision!.decisionId)] }));
      setComment("");
      setMessage("InkOS 적용 대기 영수증으로 기록했음. 원고는 아직 바뀌지 않음.");
    } catch { setMessage("연결 문제로 판정을 기록하지 못했음."); }
    finally { setPending(false); }
  }

  return <main className="library-shell firefly-review-shell">
    <GlobalSidebar user={user} active="review" />
    <section className="firefly-review-main">
      <header className="review-queue-head">
        <div><p className="kicker">FIREFLY HUMAN REVIEW</p><h1>오늘 검토</h1><p>재미와 도파민을 먼저 보고, 정합성은 치명적인 모순만 막습니다.</p></div>
        <div className="review-authority"><LockKey size={18} /><strong>정본은 InkOS</strong><span>Storyyard는 판정만 기록</span></div>
      </header>
      <nav className="review-queue" aria-label="검토 패킷">
        {packets.map((item, index) => <button key={item.packetId} className={index === packetIndex ? "active" : ""} onClick={() => selectPacket(index)}>
          <span>{item.work.title}</span><strong>{item.artifact.chapterNumber}화 · {item.artifact.title}</strong><small>{item.schemaVersion.endsWith("/v2") ? "blind pair" : `${item.candidates.length}개 후보`}</small>
        </button>)}
      </nav>
      <div className="firefly-review-grid">
        <section className="candidate-reader">
          <div className="candidate-reader-head"><div><p className="kicker">CANDIDATE</p><h2>{packet.work.title}</h2><span>{packet.artifact.chapterNumber}화 · {packet.artifact.title}</span></div>
            <div className="score-chip"><span>상업성</span><strong>{candidate.commercialScore?.toFixed(1) ?? "—"}</strong></div></div>
          <nav className="candidate-tabs" aria-label="후보 선택">{packet.candidates.map((item, index) => <button key={item.id} className={item.id === candidate.id ? "active" : ""} onClick={() => setCandidateId(item.id)}>
            후보 {String.fromCharCode(65 + index)} <span>{item.commercialScore?.toFixed(1) ?? "미평가"}</span>
          </button>)}</nav>
          {packet.schemaVersion === "firefly_review_packet/v2" && <section className="blind-comparison-banner">
            <div><ShieldCheck size={18} /><strong>독립 blind pair · {packet.comparison.round}/3</strong></div>
            <p>생성 경로와 자기점수는 숨겼습니다. 두 후보는 동일 입력·런타임에서 생성됐습니다.</p>
            <dl><div><dt>Kernel</dt><dd>{packet.comparison.runtime.kernel}</dd></div><div><dt>Model</dt><dd>{packet.comparison.runtime.model} / {packet.comparison.runtime.reasoning}</dd></div><div><dt>Pair receipt</dt><dd>{shortSha(packet.comparison.pairedGenerationReceiptSha256)}</dd></div></dl>
          </section>}
          {packet.recommendation?.candidateId === candidate.id && <p className="recommendation"><Check size={15} /> 추천 후보 · {packet.recommendation.reason}</p>}
          {packet.schemaVersion === "firefly_review_packet/v2" && <section className="commercial-dimensions">
            <header><div><p className="kicker">INDEPENDENT REVIEW</p><h3>상업성·감정적 정합성</h3></div><strong>{candidate.review.emotionalCoherence.score.toFixed(1)}</strong></header>
            <div>{Object.entries(candidate.commercialEvaluation).map(([key, value]) => <dl key={key}><dt>{commercialLabels[key] ?? key}</dt><dd>{value.toFixed(1)}</dd></dl>)}</div>
            <p className={candidate.review.contentNeutrality.passed ? "neutrality-pass" : "neutrality-alert"}>허구 내용 중립 {candidate.review.contentNeutrality.passed ? "PASS" : `${candidate.review.contentNeutrality.violations.length}건 확인 필요`} · hard contradiction {candidate.review.canonContradictions.length}건</p>
          </section>}
          <article className="candidate-prose">{candidate.body}</article>
          {packet.schemaVersion === "firefly_review_packet/v2" && <section className="surface-review">
            <header><div><p className="kicker">SURFACE HIL</p><h3>표면 비교</h3></div><span>{classifiedCount}/{allMatches.length} 분류</span></header>
            {candidate.review.surfaceComparison.surfaceMatches.length === 0
              ? <p className="surface-empty">검출된 표면 일치 없음 · 자동 감점·재작성·거절 없음</p>
              : candidate.review.surfaceComparison.surfaceMatches.map((match) => {
                const source = sourceSlices[match.matchId];
                return <article key={match.matchId} className="surface-match-card">
                  <header><strong>{match.matchMethod}</strong><code>{shortSha(match.selectorSha256)}</code></header>
                  <div className="surface-pair"><div><span>후보 구간</span><blockquote>{decodeCandidateSlice(candidate.body, match)}</blockquote></div><div><span>원문 구간 · 일회성 조회</span>
                    {source?.status === "ready" ? <><blockquote>{source.body}</blockquote><button type="button" onClick={() => setSourceSlices((current) => { const next = { ...current }; delete next[match.matchId]; return next; })}>닫고 지우기</button></>
                      : source?.status === "error" ? <p>{source.message}</p>
                        : <button type="button" disabled={source?.status === "loading"} onClick={() => openSourceSlice(match)}><Eye size={15} /> {source?.status === "loading" ? "불러오는 중…" : "원문 열기"}</button>}
                  </div></div>
                  <label><span>사람 분류</span><select value={classifications[match.matchId] ?? ""} onChange={(event) => setClassifications((current) => ({ ...current, [match.matchId]: event.target.value as SurfaceClassification }))}>
                    <option value="" disabled>분류 선택</option>{Object.entries(classificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <small>분류는 정보와 캐논 판정만 남깁니다. 자동 거리두기나 원고 수정은 하지 않습니다.</small>
                </article>;
              })}
          </section>}
          <details className="baseline-details"><summary>현재 InkOS 원고와 비교</summary><article>{packet.artifact.currentContent}</article></details>
        </section>
        <aside className="decision-dock"><form onSubmit={submit}>
          <p className="kicker">DECISION RECEIPT</p><h2>판정 남기기</h2>
          <div className="decision-options">{packet.actions.map((value) => { const Icon = icons[value]; return <label key={value} className={decision === value ? `selected ${value}` : ""}><input type="radio" checked={decision === value} onChange={() => setDecision(value)} /><Icon size={17} /><span>{labels[value]}</span></label>; })}</div>
          <label className="review-comment"><span>{decision === "approve" ? "메모 (선택)" : "작업 지시 또는 근거 (필수)"}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder={decision === "polish" ? "살릴 부분과 다듬을 부분을 짧게 적어 주세요." : "판정 이유를 적어 주세요."} /></label>
          {packet.schemaVersion === "firefly_review_packet/v2" && allMatches.length > classifiedCount && <p className="classification-required">표면 일치 {allMatches.length - classifiedCount}건을 먼저 분류해 주세요.</p>}
          <button className="black-button" disabled={pending || (packet.schemaVersion === "firefly_review_packet/v2" && allMatches.length > classifiedCount)}>{pending ? "기록 중…" : <>{labels[decision]} <ArrowRight size={15} /></>}</button>
          {message && <p className="review-message">{message}</p>}
          <p className="pending-notice"><Clock size={16} /><span>이 판정은 pending으로 저장됩니다. InkOS가 해시를 다시 확인하고 적용해야 정본이 바뀝니다.</span></p>
        </form>
        <section className="decision-history"><h3>최근 판정</h3>{(histories[packet.packetId] ?? []).map((row) => <article key={row.decisionId}><header><strong>{labels[row.decision as FireflyDecision] ?? row.decision}</strong><span>{row.status}</span></header><p>{row.candidateId}</p>{row.comment && <blockquote>{row.comment}</blockquote>}</article>)}</section>
        </aside>
      </div>
    </section>
  </main>;
}

function shortSha(value: string): string { return `${value.slice(0, 10)}…`; }

function decodeCandidateSlice(body: string, match: FireflySurfaceMatch): string {
  try {
    const bytes = new TextEncoder().encode(body).slice(match.candidate.startByte, match.candidate.endByte);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "후보 selector 오류 · 패킷 재생성 필요";
  }
}
