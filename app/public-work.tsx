"use client";

import { BookmarkSimple, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CommentThread } from "./comment-thread";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";
import type { PublicWorkSnapshot } from "./public-work-data";

type Work = PublicWorkSnapshot["work"];
type PublicTab = "manuscript" | "characters" | "documents" | "plots";
type PublicContent = { sourceId: string; kind: string; parentSourceId: string; sortOrder: number; title: string; body: string; meta: string };

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
  const [message, setMessage] = useState(initialSnapshot ? "" : "작품을 찾지 못했음.");
  const [activeTab, setActiveTab] = useState<PublicTab>("manuscript");
  const [content, setContent] = useState<Partial<Record<Exclude<PublicTab, "manuscript">, PublicContent[]>>>({});
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    if (!work || activeTab === "manuscript" || content[activeTab]) return;
    let active = true;
    setContentLoading(true);
    fetch(`/api/community/${work.id}/content?type=${activeTab}`)
      .then((response) => response.ok ? response.json() : { content: [] })
      .then((data) => {
        if (active) setContent((current) => ({ ...current, [activeTab]: data.content ?? [] }));
      })
      .catch(() => {
        if (active) setContent((current) => ({ ...current, [activeTab]: [] }));
      })
      .finally(() => { if (active) setContentLoading(false); });
    return () => { active = false; };
  }, [activeTab, content, work]);

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
            <img src={work.coverUrl || "/default-cover.png"} alt={`${work.title} 표지`} />
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
          {activeTab === "characters" && <PublicCharacters content={content.characters ?? []} loading={contentLoading} />}
          {activeTab === "documents" && <PublicDocuments content={content.documents ?? []} loading={contentLoading} />}
          {activeTab === "plots" && <PublicPlots content={content.plots ?? []} loading={contentLoading} />}

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
  return <section className="episode-section"><div className="section-title"><div><p className="kicker">MANUSCRIPT</p><h2>공개 원고</h2></div><span>{episodes.length}편</span></div><div className="episode-list">{episodes.map((episode) => <article className="episode-card" key={episode.id}><Link className="episode-heading" href={`/works/${slug}/episodes/${episode.episode_no}`} prefetch={false}><span>{episode.episode_no}화</span><strong>{episode.title}</strong><small>읽기 →</small></Link></article>)}</div></section>;
}

function PublicCharacters({ content, loading }: { content: PublicContent[]; loading: boolean }) {
  if (loading) return <PublicContentState label="등장인물 정보를 불러오는 중…" />;
  if (!content.length) return <PublicContentState label="공개된 등장인물 정보가 아직 없음." />;
  return <section className="public-content-section"><div className="section-title"><div><p className="kicker">CHARACTERS</p><h2>등장인물</h2></div><span>{content.length}명</span></div><div className="public-character-grid">{content.map((item) => {
    const meta = parseMeta(item.meta);
    return <article className="public-character-card" key={item.sourceId}><div className="public-tags">{meta.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><h3>{item.title}</h3><p>{item.body || "소개가 아직 없음."}</p>{meta.fields.length > 0 && <dl>{meta.fields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}</article>;
  })}</div></section>;
}

function PublicDocuments({ content, loading }: { content: PublicContent[]; loading: boolean }) {
  if (loading) return <PublicContentState label="자료실을 불러오는 중…" />;
  if (!content.length) return <PublicContentState label="공개된 자료가 아직 없음." />;
  return <section className="public-content-section"><div className="section-title"><div><p className="kicker">REFERENCE</p><h2>자료실</h2></div><span>{content.length}개</span></div><div className="public-document-list">{content.map((item) => <details key={item.sourceId}><summary>{item.title}</summary><p>{item.body || "내용 없음."}</p></details>)}</div></section>;
}

function PublicPlots({ content, loading }: { content: PublicContent[]; loading: boolean }) {
  if (loading) return <PublicContentState label="공개 플롯을 불러오는 중…" />;
  const plots = content.filter((item) => item.kind === "plot");
  if (!plots.length) return <PublicContentState label="공개된 플롯이 아직 없음." />;
  return <section className="public-content-section"><div className="section-title"><div><p className="kicker">PLOT</p><h2>플롯</h2></div><span>{plots.length}개</span></div>{plots.map((plot) => {
    const acts = content.filter((item) => item.kind === "act" && item.parentSourceId === plot.sourceId);
    const blocks = content.filter((item) => item.kind === "block" && item.parentSourceId === plot.sourceId);
    return <article className="public-plot" key={plot.sourceId}><h3>{plot.title}</h3>{plot.body && <p>{plot.body}</p>}{acts.map((act) => <section key={act.sourceId}><h4>{act.title}</h4>{act.body && <p>{act.body}</p>}<div>{blocks.filter((block) => parseMeta(block.meta).act === parseMeta(act.meta).act).map((block) => <article className="public-plot-block" key={block.sourceId}><strong>{block.title}</strong>{block.body && <p>{block.body}</p>}</article>)}</div></section>)}{blocks.filter((block) => !acts.some((act) => parseMeta(act.meta).act === parseMeta(block.meta).act)).map((block) => <article className="public-plot-block" key={block.sourceId}><strong>{block.title}</strong>{block.body && <p>{block.body}</p>}</article>)}</article>;
  })}</section>;
}

function PublicContentState({ label }: { label: string }) { return <section className="public-content-section"><div className="public-content-empty">{label}</div></section>; }

function parseMeta(value: string): { tags: string[]; fields: Array<{ id: string; label: string; value: string }>; act: number } {
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
    };
  } catch { return { tags: [], fields: [], act: 0 }; }
}

function RatingPicker({ value, onRate, compact = false }: { value: number; onRate: (value: number) => void; compact?: boolean }) {
  return <div className={`rating-picker ${compact ? "compact" : ""}`} aria-label="별점 선택">{!compact && <span>내 별점</span>}<div>{[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" onClick={() => onRate(score)} aria-label={`${score}점`}><Star size={compact ? 22 : 26} weight={score <= value ? "fill" : "regular"} /></button>)}</div></div>;
}
