"use client";

import { BookmarkSimple, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CommentThread } from "./comment-thread";
import { resolveCoverSrc } from "./cover-options";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";
import { usePublicationRefresh } from "./publication-events";
import type { PublicWorkSnapshot } from "./public-work-data";

type Work = PublicWorkSnapshot["work"];
type PublicTab = "manuscript" | "characters" | "documents" | "plots";
type PublicContent = PublicWorkSnapshot["content"][number];

export function PublicWork({
  user,
  setupRequired,
  initialSnapshot,
}: {
  user: SidebarUser;
  setupRequired: boolean;
  initialSnapshot: PublicWorkSnapshot | null;
}) {
  const [work, setWork] = useState<Work | null>(initialSnapshot?.work ?? null);
  const episodes = initialSnapshot?.episodes ?? [];
  const comments = initialSnapshot?.comments ?? [];
  const content = initialSnapshot?.content ?? [];
  const [message, setMessage] = useState(initialSnapshot ? "" : "작품을 찾지 못했음.");
  const [activeTab, setActiveTab] = useState<PublicTab>("manuscript");
  usePublicationRefresh();
  useEffect(() => {
    setWork(initialSnapshot?.work ?? null);
    setMessage(initialSnapshot ? "" : "작품을 찾지 못했음.");
  }, [initialSnapshot]);

  async function toggleFavorite() {
    if (!user || !work) return setMessage("선호작은 로그인 후 사용할 수 있음.");
    const response = await fetch(`/api/community/${work.id}/favorite`, { method: "POST" });
    const data = await response.json();
    if (response.ok) setWork({ ...work, isFavorite: data.favorite });
  }

  async function rate(value: number) {
    if (!user || !work) return setMessage("별점은 로그인 후 남길 수 있음.");
    const response = await fetch(`/api/community/${work.id}/rating`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value }),
    });
    if (response.ok) {
      const data = await response.json() as { value: number; ratingAverage: number; ratingCount: number };
      setWork({ ...work, myRating: data.value, ratingAverage: data.ratingAverage, ratingCount: data.ratingCount });
      setMessage(`${value}점으로 반영됨.`);
    }
  }

  return (
    <main className="library-shell public-work-shell">
      <GlobalSidebar user={user} active="community" setupRequired={setupRequired} />
      <section className="public-work-main">
        {!work ? <div className="blank-state">{message}</div> : <>
          <header className="work-hero">
            <img src={resolveCoverSrc(work.coverKey)} alt={`${work.title} 표지`} />
            <div className="work-hero-copy">
              <span className="work-genre">{work.genre}</span><h1>{work.title}</h1><p className="work-author">{work.authorName}</p><p className="work-logline">{work.logline}</p>
              <div className="work-stats"><strong><Star size={21} weight="fill" />{work.ratingCount ? work.ratingAverage.toFixed(1) : "평가 전"}</strong><span>{work.ratingCount}명 평가</span><span>{episodes.length}화 공개</span></div>
              <div className="work-actions"><button className={work.isFavorite ? "selected" : ""} onClick={toggleFavorite}><BookmarkSimple size={19} weight={work.isFavorite ? "fill" : "regular"} />{work.isFavorite ? "선호작 해제" : "선호작 추가"}</button></div>
              <RatingPicker value={work.myRating} onRate={rate} />
              {message && <p className="inline-message">{message}</p>}
            </div>
          </header>

          <nav className="public-content-tabs" aria-label="작품 공개 정보">
            <TabButton tab="manuscript" active={activeTab} onClick={setActiveTab}>원고</TabButton>
            <TabButton tab="characters" active={activeTab} onClick={setActiveTab}>등장인물</TabButton>
            <TabButton tab="documents" active={activeTab} onClick={setActiveTab}>자료실</TabButton>
            <TabButton tab="plots" active={activeTab} onClick={setActiveTab}>플롯</TabButton>
          </nav>
          {activeTab === "manuscript" && <Manuscripts episodes={episodes} slug={work.slug} />}
          {activeTab === "characters" && <PublicCharacters content={content.filter((item) => item.kind === "character")} />}
          {activeTab === "documents" && <PublicDocuments content={content.filter((item) => item.kind === "document")} />}
          {activeTab === "plots" && <PublicPlots content={content} />}

          <CommentThread publicationId={work.id} initialComments={comments} user={user} title="작품 댓글" />
        </>}
      </section>
    </main>
  );
}

function TabButton({ tab, active, onClick, children }: { tab: PublicTab; active: PublicTab; onClick: (tab: PublicTab) => void; children: string }) {
  return <button type="button" className={tab === active ? "active" : ""} onClick={() => onClick(tab)}>{children}</button>;
}

function Manuscripts({ episodes, slug }: { episodes: PublicWorkSnapshot["episodes"]; slug: string }) {
  return <section className="episode-section"><div className="section-title"><div><p className="kicker">MANUSCRIPT</p><h2>공개 원고</h2></div><span>{episodes.length}편</span></div><div className="episode-list">{episodes.map((episode) => <article className="episode-card" key={episode.id}><Link className="episode-heading" href={`/works/${slug}/episodes/${episode.episode_no}`}><span>{episode.episode_no}화</span><strong>{episode.title}</strong><small>읽기 →</small></Link></article>)}</div></section>;
}

function PublicCharacters({ content }: { content: PublicContent[] }) {
  if (!content.length) return <PublicContentState label="공개된 등장인물 정보가 아직 없음." />;
  return <section className="public-content-section"><div className="section-title"><div><p className="kicker">CHARACTERS</p><h2>등장인물</h2></div><span>{content.length}명</span></div><div className="public-character-grid">{content.map((item) => {
    const meta = parseMeta(item.meta);
    return <article className="public-character-card" key={item.sourceId}><div className="public-tags">{meta.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>{item.title}</h3><p>{item.body || "소개가 아직 없음."}</p>{meta.fields.length > 0 && <dl>{meta.fields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}</article>;
  })}</div></section>;
}

function PublicDocuments({ content }: { content: PublicContent[] }) {
  if (!content.length) return <PublicContentState label="공개된 자료가 아직 없음." />;
  return <section className="public-content-section"><div className="section-title"><div><p className="kicker">REFERENCE</p><h2>자료실</h2></div><span>{content.length}개</span></div><div className="public-document-list">{content.map((item) => <details key={item.sourceId}><summary>{item.title}</summary><p>{item.body || "내용 없음."}</p></details>)}</div></section>;
}

function PublicPlots({ content }: { content: PublicContent[] }) {
  const plots = content.filter((item) => item.kind === "plot").sort((left, right) => left.sortOrder - right.sortOrder);
  const [activePlotId, setActivePlotId] = useState(plots[0]?.sourceId ?? "");
  const [collapsedActs, setCollapsedActs] = useState<number[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<PublicContent | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  if (!plots.length) return <PublicContentState label="공개된 플롯이 아직 없음." />;
  const activePlot = plots.find((plot) => plot.sourceId === activePlotId) ?? plots[0];
  const acts = content.filter((item) => item.kind === "act" && item.parentSourceId === activePlot.sourceId).sort((left, right) => parseMeta(left.meta).act - parseMeta(right.meta).act);
  const blocks = content.filter((item) => item.kind === "block" && item.parentSourceId === activePlot.sourceId);
  const actNumbers = [...new Set([...acts.map((act) => parseMeta(act.meta).act), ...blocks.map((block) => parseMeta(block.meta).act)])].filter(Boolean).sort((a, b) => a - b);

  function scrollBoard(direction: -1 | 1) {
    const board = boardScrollRef.current;
    if (!board) return;
    board.scrollBy({ left: direction * Math.max(320, board.clientWidth * 0.82), behavior: "smooth" });
  }

  return <section className="public-content-section public-plot-board">
    <div className="plot-tabs-bar" role="tablist" aria-label="공개 플롯">
      {plots.map((plot) => <button key={plot.sourceId} role="tab" aria-selected={plot.sourceId === activePlot.sourceId} className={plot.sourceId === activePlot.sourceId ? "active" : ""} onClick={() => setActivePlotId(plot.sourceId)}>{plot.title}</button>)}
    </div>
    <div className="section-title"><div><p className="kicker">PLOT BOARD</p><h2>{activePlot.title}</h2>{activePlot.body && <p>{activePlot.body}</p>}</div><span>{blocks.length}개 블록</span></div>
    <div className="public-plot-board-controls">
      <span><strong>{actNumbers.length}개 아크</strong> · 오른쪽으로 계속 이어지는 보드</span>
      <div>
        <button type="button" aria-label="이전 아크 보기" onClick={() => scrollBoard(-1)}>←</button>
        <button type="button" aria-label="다음 아크 보기" onClick={() => scrollBoard(1)}>→</button>
      </div>
    </div>
    <div className="plot-board-scroll public-plot-board-scroll" ref={boardScrollRef} tabIndex={0} aria-label="공개 B-Rail 아크 보드">
      <div className="plot-board">
        {actNumbers.map((actNumber) => {
          const act = acts.find((item) => parseMeta(item.meta).act === actNumber);
          const collapsed = collapsedActs.includes(actNumber);
          return <section className={`act-column ${collapsed ? "collapsed" : ""}`} key={actNumber}>
            <header className="act-heading">
              <button type="button" className="act-title-button" onClick={() => setCollapsedActs((current) => current.includes(actNumber) ? current.filter((value) => value !== actNumber) : [...current, actNumber])}>{act?.title || `${actNumber}아크`}</button>
              <span>{blocks.filter((block) => parseMeta(block.meta).act === actNumber).length}</span>
            </header>
            {!collapsed && <div className="plot-card-list">{blocks.filter((block) => parseMeta(block.meta).act === actNumber).sort((left, right) => left.sortOrder - right.sortOrder).map((block) => {
              const meta = parseMeta(block.meta);
              return <button type="button" className="plot-card public" key={block.sourceId} onClick={() => setSelectedBlock(block)}>
                <strong>{block.title}</strong>
                {meta.status && <span className={`sync-status ${meta.status}`}>{meta.status}</span>}
                {block.body && <p>{preview(block.body)}</p>}
              </button>;
            })}</div>}
          </section>;
        })}
      </div>
    </div>
    {selectedBlock && <div className="public-plot-detail-backdrop" role="presentation" onClick={() => setSelectedBlock(null)}><article className="public-plot-detail" role="dialog" aria-modal="true" aria-label={selectedBlock.title} onClick={(event) => event.stopPropagation()}><button type="button" className="public-plot-detail-close" onClick={() => setSelectedBlock(null)}>닫기</button><p className="kicker">PLOT BLOCK</p><h2>{selectedBlock.title}</h2><div>{selectedBlock.body || "내용 없음."}</div></article></div>}
  </section>;
}

function PublicContentState({ label }: { label: string }) { return <section className="public-content-section"><div className="public-content-empty">{label}</div></section>; }

function preview(value: string) {
  return value.length > 320 ? `${value.slice(0, 320).trimEnd()}…` : value;
}

function parseMeta(value: string): { tags: string[]; fields: Array<{ id: string; label: string; value: string }>; act: number; status: string } {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string") : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields.flatMap((field) => {
        if (!field || typeof field !== "object") return [];
        const item = field as Record<string, unknown>;
        return typeof item.id === "string" ? [{ id: item.id, label: typeof item.label === "string" ? item.label : "", value: typeof item.value === "string" ? item.value : "" }] : [];
      }) : [],
      act: typeof parsed.act === "number" ? parsed.act : 0,
      status: typeof parsed.status === "string" ? parsed.status : "",
    };
  } catch { return { tags: [], fields: [], act: 0, status: "" }; }
}

function RatingPicker({ value, onRate, compact = false }: { value: number; onRate: (value: number) => void; compact?: boolean }) {
  return <div className={`rating-picker ${compact ? "compact" : ""}`} aria-label="별점 선택">{!compact && <span>내 별점</span>}<div>{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" onClick={() => onRate(score)} aria-label={`${score}점`}><Star size={compact ? 22 : 26} weight={score <= value ? "fill" : "regular"} /></button>)}</div></div>;
}
