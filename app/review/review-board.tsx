"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, Clock, LockKey, MagicWand, Pause, X } from "@phosphor-icons/react";
import { GlobalSidebar, SidebarUser } from "@/app/global-sidebar";
import type { FireflyDecision, FireflyReviewPacket } from "@/app/firefly-review-packets";

type DecisionRow = { decisionId: string; candidateId: string; decision: string; comment: string; status: string; createdAt: string };
const labels: Record<FireflyDecision, string> = { approve: "이 후보 승인", polish: "폴리싱 요청", hold: "보류", reject: "반려" };
const icons = { approve: Check, polish: MagicWand, hold: Pause, reject: X };

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
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/firefly/review-decisions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ packetId: packet.packetId, packetSha256: packet.packetSha256,
          candidateId: candidate.id, candidateSha256: candidate.sha256, decision, comment }),
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
          <span>{item.work.title}</span><strong>{item.artifact.chapterNumber}화 · {item.artifact.title}</strong><small>{item.candidates.length}개 후보</small>
        </button>)}
      </nav>
      <div className="firefly-review-grid">
        <section className="candidate-reader">
          <div className="candidate-reader-head"><div><p className="kicker">CANDIDATE</p><h2>{packet.work.title}</h2><span>{packet.artifact.chapterNumber}화 · {packet.artifact.title}</span></div>
            <div className="score-chip"><span>상업성</span><strong>{candidate.commercialScore?.toFixed(1) ?? "—"}</strong></div></div>
          <nav className="candidate-tabs" aria-label="후보 선택">{packet.candidates.map((item, index) => <button key={item.id} className={item.id === candidate.id ? "active" : ""} onClick={() => setCandidateId(item.id)}>
            후보 {String.fromCharCode(65 + index)} <span>{item.commercialScore?.toFixed(1) ?? "미평가"}</span>
          </button>)}</nav>
          {packet.recommendation?.candidateId === candidate.id && <p className="recommendation"><Check size={15} /> 추천 후보 · {packet.recommendation.reason}</p>}
          <article className="candidate-prose">{candidate.body}</article>
          <details className="baseline-details"><summary>현재 InkOS 원고와 비교</summary><article>{packet.artifact.currentContent}</article></details>
        </section>
        <aside className="decision-dock"><form onSubmit={submit}>
          <p className="kicker">DECISION RECEIPT</p><h2>판정 남기기</h2>
          <div className="decision-options">{packet.actions.map((value) => { const Icon = icons[value]; return <label key={value} className={decision === value ? `selected ${value}` : ""}><input type="radio" checked={decision === value} onChange={() => setDecision(value)} /><Icon size={17} /><span>{labels[value]}</span></label>; })}</div>
          <label className="review-comment"><span>{decision === "approve" ? "메모 (선택)" : "작업 지시 또는 근거 (필수)"}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder={decision === "polish" ? "살릴 부분과 다듬을 부분을 짧게 적어 주세요." : "판정 이유를 적어 주세요."} /></label>
          <button className="black-button" disabled={pending}>{pending ? "기록 중…" : <>{labels[decision]} <ArrowRight size={15} /></>}</button>
          {message && <p className="review-message">{message}</p>}
          <p className="pending-notice"><Clock size={16} /><span>이 판정은 pending으로 저장됩니다. InkOS가 해시를 다시 확인하고 적용해야 정본이 바뀝니다.</span></p>
        </form>
        <section className="decision-history"><h3>최근 판정</h3>{(histories[packet.packetId] ?? []).map((row) => <article key={row.decisionId}><header><strong>{labels[row.decision as FireflyDecision] ?? row.decision}</strong><span>{row.status}</span></header><p>{row.candidateId}</p>{row.comment && <blockquote>{row.comment}</blockquote>}</article>)}</section>
        </aside>
      </div>
    </section>
  </main>;
}
