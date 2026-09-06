"use client";

import { FormEvent, useState } from "react";
import { PlanningVariationReview, variationVerdictLabels } from "./planning-variation";
import { PlanningEvidence, PlanningIndependentSourceReview, PlanningProjectPlan } from "./planning-evidence";
import { ArrowRight, Check, Clock, Eye, LockKey, MagicWand, Pause, ShieldCheck, X } from "@phosphor-icons/react";
import { GlobalSidebar, SidebarUser } from "@/app/global-sidebar";
import { fireflyReviewQueueMetadata } from "@/app/firefly-review-display.mjs";
import type { FireflyDecision, FireflyHumanPremiseCandidateV4, FireflyPitchReviewCandidateV3, FireflyReviewPacket, FireflySurfaceMatch, SurfaceClassification } from "@/app/firefly-review-packets";

type DecisionRow = { decisionId: string; candidateId: string | null; decision: string; comment: string; status: string; createdAt: string };
type DecisionChoice = FireflyDecision | "";
const labels: Record<FireflyDecision, string> = {
  approve: "이 후보 승인", polish: "폴리싱 요청", hold: "보류", reject: "반려",
  select: "이 후보 선택", tie: "동률", invalid: "페어 무효",
};
const icons = { approve: Check, polish: MagicWand, hold: Pause, reject: X, select: Check, tie: Pause, invalid: X };
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

export function FireflyReviewBoard({ user, packets, completedCount, initialDecisions, initialPacketId, initialCandidateId }: {
  user: Exclude<SidebarUser, null>;
  packets: FireflyReviewPacket[];
  completedCount: number;
  initialDecisions: Record<string, DecisionRow[]>;
  initialPacketId?: string;
  initialCandidateId?: string;
}) {
  const [packetIndex, setPacketIndex] = useState(() => Math.max(0, packets.findIndex((item) => item.packetId === initialPacketId)));
  const packet = packets[packetIndex] ?? null;
  const [candidateId, setCandidateId] = useState(() => packet?.candidates.find((item) => item.id === initialCandidateId)?.id ?? packet?.candidates[0]?.id ?? "");
  const candidate = packet?.candidates.find((item) => item.id === candidateId) ?? packet?.candidates[0] ?? null;
  const v2Candidate = packet?.schemaVersion === "firefly_review_packet/v2"
    ? packet.candidates.find((item) => item.id === candidateId) ?? packet.candidates[0]
    : null;
  const v3Candidate = packet?.schemaVersion === "firefly_review_packet/v3"
    ? packet.candidates.find((item) => item.id === candidateId) ?? packet.candidates[0]
    : null;
  const v4Candidate = packet?.schemaVersion === "firefly_review_packet/v4"
    ? packet.candidates.find((item) => item.id === candidateId) ?? packet.candidates[0]
    : null;
  const v5Candidate = packet?.schemaVersion === "firefly_review_packet/v5"
    ? packet.candidates.find((item) => item.id === candidateId) ?? packet.candidates[0]
    : null;
  const [decision, setDecision] = useState<DecisionChoice>(defaultDecision(packet ?? undefined));
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
          <p>원고 적용 또는 평가 수신 영수증까지 확인된 패킷은 활성 큐에서 자동 종료됩니다.</p>
          {completedCount > 0 && <span>종료된 패킷 {completedCount}개</span>}
        </section>
      </section>
    </main>;
  }

  function selectPacket(index: number) {
    if (index !== packetIndex && (packet?.schemaVersion === "firefly_review_packet/v5" || packets[index]?.schemaVersion === "firefly_review_packet/v5")) setComment("");
    setPacketIndex(index);
    setCandidateId(packets[index]?.candidates[0]?.id ?? "");
    setDecision(defaultDecision(packets[index]));
    setClassifications({});
    setSourceSlices({});
    setMessage("");
  }

  function selectCandidate(id: string) {
    if (id !== candidate?.id && packet?.schemaVersion === "firefly_review_packet/v5") {
      setDecision(defaultDecision(packet));
      setComment("");
      setMessage("");
    }
    setCandidateId(id);
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
    if (!decision) { setMessage("사람 판정을 먼저 선택해 줘."); return; }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/firefly/review-decisions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ packetId: packet.packetId, packetSha256: packet.packetSha256,
          candidateId: packet.schemaVersion === "firefly_review_packet/v2" && decision !== "select" ? null : candidate.id,
          candidateSha256: packet.schemaVersion === "firefly_review_packet/v2" && decision !== "select" ? null : candidate.sha256,
          decision, comment,
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
      setDecision(defaultDecision(packet));
      setMessage(packet.schemaVersion === "firefly_review_packet/v2"
        ? "사람 평가를 pending으로 기록했음. 원고와 캐논은 바뀌지 않음."
        : packet.schemaVersion === "firefly_review_packet/v5"
          ? decision === "select"
            ? "선택한 변주 방향과 이유를 기록했습니다. 다음 전체 기획서의 기준이 됩니다."
            : decision === "hold" ? "변주안의 보류 이유를 기록했습니다." : "변주안의 반려 이유를 기록했습니다."
        : packet.schemaVersion === "firefly_review_packet/v4"
          ? "Human Premise 판정을 pending으로 기록했음. 아직 기획 확장·Book·원고는 생성되지 않음."
        : packet.schemaVersion === "firefly_review_packet/v3"
          ? v3Candidate?.spineRetention?.schemaVersion === "firefly_spine_retention/v2"
            ? "원작 중심 기획 판정을 pending으로 기록했음. 이번 단계는 기획 선택까지이며 Book·아크·원고로 이어지지 않음."
            : "기획 판정을 pending으로 기록했음. InkOS 승인 전에는 집필이 시작되지 않음."
          : "InkOS 적용 대기 영수증으로 기록했음. 원고는 아직 바뀌지 않음.");
    } catch { setMessage("연결 문제로 판정을 기록하지 못했음."); }
    finally { setPending(false); }
  }

  return <main className={`library-shell firefly-review-shell${v3Candidate ? " ff-plan-view" : ""}`}>
    <GlobalSidebar user={user} active="review" />
    <section className="firefly-review-main">
      <header className="review-queue-head">
        <div><p className="kicker">FIREFLY HUMAN REVIEW</p><h1>오늘 검토</h1><p>재미와 도파민을 먼저 보고, 정합성은 치명적인 모순만 막습니다.</p></div>
        <div className="review-authority"><LockKey size={18} /><strong>정본은 InkOS</strong><span>Storyyard는 판정만 기록</span></div>
      </header>
      <nav className="review-queue" aria-label="검토 패킷">
        {packets.map((item, index) => <button key={item.packetId} className={index === packetIndex ? "active" : ""} onClick={() => selectPacket(index)}>
          <span>{item.schemaVersion === "firefly_review_packet/v3" ? "기획서" : item.work.title}</span><strong>{item.schemaVersion === "firefly_review_packet/v5" ? `초반 변주 · ${item.artifact.title}` : item.schemaVersion === "firefly_review_packet/v4" ? `전제 · ${item.artifact.title}` : item.schemaVersion === "firefly_review_packet/v3" ? (item.candidates[0]?.titleCandidates[0] ?? item.work.title) : `${item.artifact.chapterNumber}화 · ${item.artifact.title}`}</strong><small>{fireflyReviewQueueMetadata(item)}</small>
        </button>)}
      </nav>
      <div className="firefly-review-grid">
        <section className="candidate-reader">
          <div className="candidate-reader-head"><div><p className="kicker">{packet.schemaVersion === "firefly_review_packet/v5" ? "OPENING VARIATION" : packet.schemaVersion === "firefly_review_packet/v4" ? "HUMAN PREMISE" : packet.schemaVersion === "firefly_review_packet/v3" ? "기획서" : "CANDIDATE"}</p><h2>{v3Candidate ? "후보 기획서" : packet.work.title}</h2><span>{packet.schemaVersion === "firefly_review_packet/v5" ? `${packet.scope.episodeStart}~${packet.scope.episodeEnd}화 · ${packet.scope.through}` : packet.schemaVersion === "firefly_review_packet/v4" ? "기획 확장 전 사람 욕망 HIL" : packet.schemaVersion === "firefly_review_packet/v3" ? `후보 ${String.fromCharCode(65 + packet.candidates.findIndex((item) => item.id === candidate.id))} · ${packet.work.targetChapters}화 목표` : `${packet.artifact.chapterNumber}화 · ${packet.artifact.title}`}</span></div>
            {!v3Candidate && <div className="score-chip"><span>{v5Candidate ? "독립 심사" : "상업성"}</span><strong>{candidateCommercialScore(packet, candidate.id)}</strong></div>}</div>
          <nav className="candidate-tabs" aria-label="후보 선택">{packet.candidates.map((item, index) => <button key={item.id} className={item.id === candidate.id ? "active" : ""} onClick={() => selectCandidate(item.id)}>
            후보 {String.fromCharCode(65 + index)} {!v3Candidate && <span>{candidateCommercialScore(packet, item.id)}</span>}
          </button>)}</nav>
          {v5Candidate && <section className="planning-entry-banner"><div><ShieldCheck size={18} /><strong>초반 구간 변주 방향 선택</strong></div><p>p01을 기준으로, 사건을 바꿔도 주인공의 이익과 읽는 재미가 살아 있는지 비교해 주세요.</p></section>}
          {v4Candidate && <section className="planning-entry-banner">
            <div><ShieldCheck size={18} /><strong>Human Premise · 상업 기획 확장 전 필수 HIL</strong></div>
            <p>회사·돈·지분·권한을 지워도 남는 사람의 욕망, 오늘의 선택, 감정적 지급을 먼저 확인합니다. 선택해도 Book·Arc·Rail·원고는 만들지 않습니다.</p>
          </section>}
          {packet.schemaVersion === "firefly_review_packet/v2" && <section className="blind-comparison-banner">
            <div><ShieldCheck size={18} /><strong>독립 blind pair · {packet.comparison.round}/3 · 평가 전용</strong></div>
            <p>생성 경로와 label 매핑은 숨겼습니다. 선택은 승자 평가 영수증만 남기며 원고·캐논을 적용하지 않습니다.</p>
            <dl><div><dt>Kernel</dt><dd>{packet.comparison.runtime.kernel}</dd></div><div><dt>Model</dt><dd>{packet.comparison.runtime.model} / {packet.comparison.runtime.reasoning}</dd></div><div><dt>Pair receipt</dt><dd>{shortSha(packet.comparison.pairedGenerationReceiptSha256)}</dd></div></dl>
          </section>}
          {!v3Candidate && packet.recommendation?.candidateId === candidate.id && <p className="recommendation"><Check size={15} /> 추천 후보 · {packet.recommendation.reason}</p>}
          {v2Candidate && <section className="commercial-dimensions">
            <header><div><p className="kicker">INDEPENDENT REVIEW</p><h3>상업성·감정적 정합성</h3></div><strong>{v2Candidate.review.emotionalCoherence.score.toFixed(1)}</strong></header>
            <div>{Object.entries(v2Candidate.commercialEvaluation).map(([key, value]) => <dl key={key}><dt>{commercialLabels[key] ?? key}</dt><dd>{value.toFixed(1)}</dd></dl>)}</div>
            <p className={v2Candidate.review.contentNeutrality.passed ? "neutrality-pass" : "neutrality-alert"}>허구 내용 중립 {v2Candidate.review.contentNeutrality.passed ? "PASS" : `${v2Candidate.review.contentNeutrality.violations.length}건 확인 필요`} · hard contradiction {v2Candidate.review.canonContradictions.length}건</p>
          </section>}
          {v5Candidate && packet.schemaVersion === "firefly_review_packet/v5" && <PlanningVariationReview candidate={v5Candidate} packet={packet} />}
          {v3Candidate && <PlanningEntryReview key={v3Candidate.id} candidate={v3Candidate} recommendation={packet.recommendation?.candidateId === v3Candidate.id ? packet.recommendation.reason : undefined} />}
          {v4Candidate && packet.schemaVersion === "firefly_review_packet/v4" && <HumanPremiseReview candidate={v4Candidate} packet={packet} />}
          {packet.schemaVersion !== "firefly_review_packet/v3" && packet.schemaVersion !== "firefly_review_packet/v4" && packet.schemaVersion !== "firefly_review_packet/v5" && "body" in candidate && <article className="candidate-prose">{candidate.body}</article>}
          {v2Candidate && <section className="surface-review">
            <header><div><p className="kicker">SURFACE HIL</p><h3>표면 비교</h3></div><span>{classifiedCount}/{allMatches.length} 분류</span></header>
            {v2Candidate.review.surfaceComparison.surfaceMatches.length === 0
              ? <p className="surface-empty">검출된 표면 일치 없음 · 자동 감점·재작성·거절 없음</p>
              : v2Candidate.review.surfaceComparison.surfaceMatches.map((match) => {
                const source = sourceSlices[match.matchId];
                return <article key={match.matchId} className="surface-match-card">
                  <header><strong>{match.matchMethod}</strong><code>{shortSha(match.selectorSha256)}</code></header>
                  <div className="surface-pair"><div><span>후보 구간</span><blockquote>{decodeCandidateSlice(v2Candidate.body, match)}</blockquote></div><div><span>원문 구간 · 일회성 조회</span>
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
          {packet.schemaVersion !== "firefly_review_packet/v3" && packet.schemaVersion !== "firefly_review_packet/v4" && packet.schemaVersion !== "firefly_review_packet/v5" && <details className="baseline-details"><summary>현재 InkOS 원고와 비교</summary><article>{packet.artifact.currentContent}</article></details>}
        </section>
        <aside className="decision-dock"><form onSubmit={submit}>
          <p className="kicker">DECISION RECEIPT</p><h2>판정 남기기</h2>
          <div className="decision-options">{packet.actions.map((value) => { const Icon = icons[value]; return <label key={value} className={decision === value ? `selected ${value}` : ""}><input type="radio" checked={decision === value} onChange={() => setDecision(value)} /><Icon size={17} /><span>{decisionLabel(packet, value)}</span></label>; })}</div>
          <label className="review-comment"><span>{packet.schemaVersion === "firefly_review_packet/v5" ? "판정 이유 (필수)" : decision === "approve" || decision === "select" ? "메모 (선택)" : "근거 (필수)"}</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder={packet.schemaVersion === "firefly_review_packet/v5" ? "좋았던 사건과 바꿀 부분을 짧게 적어 주세요." : decision === "polish" ? "살릴 부분과 다듬을 부분을 짧게 적어 주세요." : "판정 이유를 적어 주세요."} /></label>
          {packet.schemaVersion === "firefly_review_packet/v2" && allMatches.length > classifiedCount && <p className="classification-required">표면 일치 {allMatches.length - classifiedCount}건을 먼저 분류해 주세요.</p>}
          <button className="black-button" disabled={pending || !decision || (packet.schemaVersion === "firefly_review_packet/v2" && allMatches.length > classifiedCount)}>{pending ? "기록 중…" : decision ? <>{decisionLabel(packet, decision)} <ArrowRight size={15} /></> : "사람 판정 선택"}</button>
          {message && <p className="review-message">{message}</p>}
          <p className="pending-notice"><Clock size={16} /><span>{packet.schemaVersion === "firefly_review_packet/v2"
            ? "이 평가는 pending으로 저장됩니다. 수신 확인 뒤에도 원고·캐논에는 적용되지 않습니다."
            : packet.schemaVersion === "firefly_review_packet/v5"
              ? "이 변주 방향 판정은 pending으로 저장됩니다. 전체 기획 선택이나 Book·아크·원고 생성으로 이어지지 않습니다."
            : packet.schemaVersion === "firefly_review_packet/v4"
              ? "이 Human Premise 판정은 pending입니다. 선택해도 상업 기획·Book·Arc·Rail·원고는 생성되지 않습니다."
            : packet.schemaVersion === "firefly_review_packet/v3"
              ? v3Candidate?.spineRetention?.schemaVersion === "firefly_spine_retention/v2"
                ? "이 기획 판정은 pending으로 저장됩니다. 이번 원작 중심 기획 선택은 Book·아크·원고 생성으로 이어지지 않습니다."
                : "이 기획 판정은 pending으로 저장됩니다. InkOS가 선택 영수증을 확인하기 전에는 집필할 수 없습니다."
              : "이 판정은 pending으로 저장됩니다. InkOS가 해시를 다시 확인하고 적용해야 정본이 바뀝니다."}</span></p>
        </form>
        <section className="decision-history"><h3>최근 판정</h3>{(histories[packet.packetId] ?? []).map((row) => <article key={row.decisionId}><header><strong>{decisionLabel(packet, row.decision as FireflyDecision) ?? row.decision}</strong><span>{row.status}</span></header>{row.candidateId && <p>{row.candidateId}</p>}{row.comment && <blockquote>{row.comment}</blockquote>}</article>)}</section>
        </aside>
      </div>
    </section>
  </main>;
}

function shortSha(value: string): string { return `${value.slice(0, 10)}…`; }

function defaultDecision(packet: FireflyReviewPacket | undefined): DecisionChoice {
  return packet?.schemaVersion === "firefly_review_packet/v1" ? "approve" : "";
}

function candidateCommercialScore(packet: FireflyReviewPacket, candidateId: string): string {
  if (packet.schemaVersion === "firefly_review_packet/v5") {
    const review = packet.candidates.find((item) => item.id === candidateId)?.independentReview;
    return review ? variationVerdictLabels[review.verdict] : "—";
  }
  if (packet.schemaVersion === "firefly_review_packet/v4") {
    const gates = packet.candidates.find((item) => item.id === candidateId)?.independentReview.gates;
    return gates ? `${Object.values(gates).filter(Boolean).length}/5` : "—";
  }
  if (packet.schemaVersion === "firefly_review_packet/v3") {
    return packet.candidates.find((item) => item.id === candidateId)?.independentReview.independentScore.total.toFixed(0) ?? "—";
  }
  const candidate = packet.candidates.find((item) => item.id === candidateId) ?? packet.candidates[0];
  return candidate?.commercialScore?.toFixed(1) ?? "미평가";
}

function decisionLabel(packet: FireflyReviewPacket, decision: FireflyDecision): string {
  if (packet.schemaVersion === "firefly_review_packet/v5" && decision === "select") return "이 변주 방향 선택";
  if (packet.schemaVersion === "firefly_review_packet/v5" && decision === "reject") return "이 변주안 반려";
  if (packet.schemaVersion === "firefly_review_packet/v5" && decision === "hold") return "변주안 보류";
  if (packet.schemaVersion === "firefly_review_packet/v4" && decision === "select") return "이 전제 선택";
  if (packet.schemaVersion === "firefly_review_packet/v4" && decision === "reject") return "이 전제 탈락";
  if (packet.schemaVersion === "firefly_review_packet/v4" && decision === "hold") return "전제 보류";
  if (packet.schemaVersion === "firefly_review_packet/v3" && decision === "reject") return "이 기획 탈락";
  if (packet.schemaVersion === "firefly_review_packet/v3" && decision === "hold") return "기획 보류";
  return labels[decision];
}

function HumanPremiseReview({ candidate, packet }: { candidate: FireflyHumanPremiseCandidateV4; packet: Extract<FireflyReviewPacket, { schemaVersion: "firefly_review_packet/v4" }> }) {
  const labels: Record<string, string> = { humanDesire: "사람 욕망", sourceGrounded: "원문 근거", sceneableToday: "오늘 장면화", nonMechanical: "기계 욕망 아님", voiceGrounded: "문체 근거" };
  return <div className="planning-entry-review">
    <section className="planning-promise">
      <p className="kicker">ONE-LINE HUMAN PROMISE</p><h3>{candidate.titleCandidates[0]}</h3><blockquote>{candidate.oneLineHumanPromise}</blockquote>
      <p><strong>주축 참고작</strong>{packet.sourceBinding.sourceWork?.workTitle ?? packet.sourceBinding.packId}</p>
      <p><strong>원문 결속</strong>{packet.sourceBinding.sourceWork?.workSlug ?? packet.sourceBinding.packId} · beat {candidate.sourceBeatSequences.join(", ")} · style {candidate.styleExampleIds.join(", ")}</p>
    </section>
    <section className="entry-gate-card">
      <header><div><p className="kicker">INDEPENDENT HUMAN GROUNDING</p><h3>{candidate.independentReview.verdict}</h3></div><strong className={Object.values(candidate.independentReview.gates).every(Boolean) ? "gate-pass" : "gate-fail"}>{Object.values(candidate.independentReview.gates).every(Boolean) ? "PASS" : "FAIL"}</strong></header>
      <dl>{Object.entries(candidate.independentReview.gates).map(([key, passed]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{passed ? "PASS" : "FAIL"}</dd></div>)}</dl>
    </section>
    <section className="planning-contract-grid">
      <article><p className="kicker">PERSON</p><h3>권력보다 먼저인 사람</h3><dl><div><dt>현재의 사람</dt><dd>{candidate.humanPremise.protagonistAsPerson}</dd></div><div><dt>사적 욕망</dt><dd>{candidate.humanPremise.privateWant}</dd></div><div><dt>체감 결핍</dt><dd>{candidate.humanPremise.feltLack}</dd></div><div><dt>대상</dt><dd>{candidate.humanPremise.targetPerson}</dd></div></dl></article>
      <article><p className="kicker">CHOICE & PAYMENT</p><h3>오늘의 선택과 정서 지급</h3><dl><div><dt>왜 오늘</dt><dd>{candidate.humanPremise.whyToday}</dd></div><div><dt>첫 선택</dt><dd>{candidate.humanPremise.firstChoice}</dd></div><div><dt>감정 지급</dt><dd>{candidate.humanPremise.emotionalPayment}</dd></div><div><dt>권력 제거 후</dt><dd>{candidate.humanPremise.stillHumanWithoutPower}</dd></div></dl></article>
    </section>
    <section className="commercial-promise-card"><p className="kicker">FIRST SCENE</p><h3>상황 → 압박 → 행동 → 목격 변화</h3><dl><div><dt>상황</dt><dd>{candidate.firstScene.currentSituation}</dd></div><div><dt>압박</dt><dd>{candidate.firstScene.pressure}</dd></div><div><dt>행동</dt><dd>{candidate.firstScene.action}</dd></div><div><dt>목격 변화</dt><dd>{candidate.firstScene.witnessedChange}</dd></div></dl></section>
    <section className="planning-review-notes"><div><strong>강점</strong><p>{candidate.independentReview.decisiveStrength}</p></div><div><strong>위험</strong><p>{candidate.independentReview.decisiveRisk}</p></div><div><strong>필수 수선</strong><p>{candidate.independentReview.requiredRepair}</p></div></section>
    <section className="planning-review-notes"><div><strong>보존한 원문 기능</strong><p>{candidate.retainedReferenceTraits.join(" · ")}</p></div><div><strong>표면 변주</strong><p>{candidate.surfaceVariation}</p></div><div><strong>런타임</strong><p>{packet.runtimeReceipt.model}/{packet.runtimeReceipt.reasoning} · {packet.runtimeReceipt.soul.soulId}</p></div></section>
  </div>;
}

function PlanningEntryReview({ candidate, recommendation }: { candidate: FireflyPitchReviewCandidateV3; recommendation?: string }) {
  const { entryContract, independentReview } = candidate;
  const scoreLabels: Record<string, string> = {
    promise: "약속", earlyPayoff: "초반 결제", repeatEngine: "반복 엔진",
    railConversion: "성과·관계 연결", longRunSupply: "장기 공급력",
  };
  return <div className="planning-entry-review ff-plan-reading">
    <section className="planning-promise ff-plan-intro">
      <p className="kicker">이야기의 약속</p>
      <h3>{candidate.titleCandidates[0]}</h3>
      <blockquote>{candidate.oneLinePromise}</blockquote>
      <ol className="ff-plan-flow" aria-label="주인공의 행동 흐름">{candidate.protagonist.repeatedVerb.split("→").map((step, index) => <li key={index}><span>{index + 1}</span><p>{step.trim()}</p></li>)}</ol>
    </section>
    {candidate.projectPlan && <PlanningProjectPlan markdown={candidate.projectPlan.markdown} />}
    <details className="ff-plan-details">
      <summary>인물의 목적과 독자 약속</summary>
      <div className="ff-plan-details-body">
        <p className="ff-plan-evidence-text"><strong>주인공이 반복하는 행동</strong> {candidate.protagonist.repeatedVerb}</p>
    <section className="planning-contract-grid">
      <article><p className="kicker">HUMAN DRIVE</p><h3>욕망과 정서 비용</h3><dl><div><dt>결핍·모욕</dt><dd>{entryContract.humanDrive.lackOrHumiliation}</dd></div><div><dt>개인 욕망</dt><dd>{entryContract.humanDrive.personalDesire}</dd></div><div><dt>사익</dt><dd>{entryContract.humanDrive.selfInterest}</dd></div><div><dt>정서 비용 상한</dt><dd>{entryContract.humanDrive.emotionalCostLimit}</dd></div></dl></article>
      <article><p className="kicker">PURPOSE</p><h3>장기·첫 전개·1화 목적</h3><dl><div><dt>장기 목적</dt><dd>{entryContract.purpose.seriesWhat}</dd></div><div><dt>첫 전개 목적</dt><dd>{entryContract.purpose.arcWhat}</dd></div><div><dt>1화 목적</dt><dd>{entryContract.purpose.chapterWant}</dd></div><div><dt>왜 지금</dt><dd>{entryContract.purpose.whyNow}</dd></div></dl></article>
    </section>
    <section className="commercial-promise-card"><p className="kicker">COMMERCIAL PROMISE</p><h3>상황 → 우위 → 결제</h3><dl><div><dt>현재 상황</dt><dd>{entryContract.commercialPromise.currentSituation}</dd></div><div><dt>독자 판타지</dt><dd>{entryContract.commercialPromise.repeatableReaderFantasy}</dd></div><div><dt>우위의 작동</dt><dd>{entryContract.commercialPromise.howAdvantage}</dd></div><div><dt>첫 결제</dt><dd>{entryContract.commercialPromise.firstPayoff}</dd></div><div><dt>지급 확인·향유</dt><dd>{entryContract.commercialPromise.payoffWitness}</dd></div><div><dt>다음 결제 질문</dt><dd>{entryContract.commercialPromise.nextPaymentQuestion}</dd></div></dl></section>
      </div>
    </details>
    <details className="ff-plan-details">
      <summary>성과·관계 변화와 초반 전개</summary>
      <div className="ff-plan-details-body">
    <section className="planning-contract-grid">
      <article><h3>성과 누적</h3><ol>{candidate.railA.map((item, index) => <li key={index}>{item}</li>)}</ol></article>
      <article><h3>관계 변화</h3>{candidate.railB.length ? <ol>{candidate.railB.map((item, index) => <li key={index}>{item}</li>)}</ol> : <p>해당 없음</p>}</article>
    </section>
    <section className="commercial-promise-card"><h3>장기 전개와 지급</h3><div className="planning-table-scroll ff-plan-table-cards"><table><thead><tr><th>전개 순서</th><th>실행</th><th>실제 보상</th><th>관계 변화</th></tr></thead><tbody>{candidate.arcLadder.map((arc, index) => <tr key={index}><th scope="row">{arc.arc}</th><td data-label="실행">{arc.externalMove}</td><td data-label="실제 보상">{arc.visibleReward}</td><td data-label="관계 변화">{arc.relationshipConversion ?? "해당 없음"}</td></tr>)}</tbody></table></div><p><strong>장기 위험</strong> {candidate.longRunRisk}</p></section>
    <section className="opening-payment-grid">{candidate.openingEpisodes.map((episode) => <article key={episode.episode}><span>{episode.episode}화</span><strong>{episode.event}</strong><p>{episode.visiblePayoff}</p></article>)}</section>
      </div>
    </details>
    <details className="ff-plan-details">
      <summary>독립 심사의 판단과 추천 이유</summary>
      <div className="ff-plan-details-body">
        {recommendation && <section className="ff-plan-evidence-text"><h3>추천 이유</h3><p>{recommendation}</p></section>}
    <section className="planning-review-notes"><div><strong>강점</strong><p>{independentReview.decisiveStrength}</p></div><div><strong>위험</strong><p>{independentReview.decisiveRisk}</p></div><div><strong>필수 수선</strong><p>{independentReview.requiredRepair}</p></div></section>
    <section className="planning-score-grid">{Object.entries(independentReview.independentScore).filter(([key]) => key !== "total").map(([key, value]) => <dl key={key}><dt>{scoreLabels[key] ?? key}</dt><dd>{value}/20</dd></dl>)}</section>
        <details className="ff-plan-note">
          <summary>기획 단계와 진행 조건</summary>
          <p>{candidate.spineRetention?.schemaVersion === "firefly_spine_retention/v2"
            ? "원작의 자기 목표·선택·실제 이득이 기획서에 보존됐는지 대조합니다. 이번 단계는 기획 선택까지이며 Book·아크·원고로 이어지지 않습니다."
            : "인간 욕망, 당장 벌어진 상황, 주인공의 행동 목적과 첫 결제를 먼저 확인합니다. 선택 전에는 Book·Arc·원고를 만들지 않습니다."}</p>
    <section className="entry-gate-card">
      <header><div><p className="kicker">INDEPENDENT ENTRY GATE</p><h3>{independentReview.verdict}</h3></div><strong className={independentReview.entryGate.passed ? "gate-pass" : "gate-fail"}>{independentReview.entryGate.passed ? "PASS" : "FAIL"}</strong></header>
      <dl><div><dt>지금 누구인가</dt><dd>{independentReview.entryGate.protagonistNow}</dd></div><div><dt>개인 욕망</dt><dd>{independentReview.entryGate.personalWant}</dd></div><div><dt>왜 지금인가</dt><dd>{independentReview.entryGate.whyNow}</dd></div><div><dt>반복 판타지</dt><dd>{independentReview.entryGate.repeatableFantasy}</dd></div><div><dt>1화 목표</dt><dd>{independentReview.entryGate.chapterGoal}</dd></div></dl>
      {independentReview.entryGate.failureReasons.length > 0 && <ul>{independentReview.entryGate.failureReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    </section>
        </details>
      </div>
    </details>
    <details className="ff-plan-details">
      <summary>원작에서 유지하고 바꾼 것</summary>
      <div className="ff-plan-details-body">
        {independentReview.sourceChecks && <PlanningIndependentSourceReview checks={independentReview.sourceChecks} />}
        <PlanningEvidence candidate={candidate} />
      </div>
    </details>
  </div>;
}

function decodeCandidateSlice(body: string, match: FireflySurfaceMatch): string {
  try {
    const bytes = new TextEncoder().encode(body).slice(match.candidate.startByte, match.candidate.endByte);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "후보 selector 오류 · 패킷 재생성 필요";
  }
}
