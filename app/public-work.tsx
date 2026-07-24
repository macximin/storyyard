"use client";

import { BookmarkSimple, ChatCircle, Star } from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";

type Work = {
  id: string;
  slug: string;
  title: string;
  logline: string;
  genre: string;
  coverUrl: string;
  authorName: string;
  publishedAt: string;
  ratingAverage: number;
  ratingCount: number;
  isFavorite: boolean;
  myRating: number;
};
type Episode = { id: string; episode_no: number; title: string; body: string; published_at: string; updated_at: string };
type Comment = { id: string; body: string; created_at: string; display_name: string; username: string };

export function PublicWork({
  slug,
  user,
  setupRequired,
}: {
  slug: string;
  user: SidebarUser;
  setupRequired: boolean;
}) {
  const [work, setWork] = useState<Work | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [openEpisode, setOpenEpisode] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/community/${slug}`);
    const data = await response.json();
    if (!response.ok) {
      setMessage("작품을 찾지 못했음.");
      return;
    }
    setWork(data.work);
    setEpisodes(data.episodes ?? []);
    setComments(data.comments ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/community/${slug}`)
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        if (!response.ok) {
          setMessage("작품을 찾지 못했음.");
          return;
        }
        setWork(data.work);
        setEpisodes(data.episodes ?? []);
        setComments(data.comments ?? []);
      });
    return () => { active = false; };
  }, [slug, user?.id]);

  async function toggleFavorite() {
    if (!user || !work) return setMessage("선호작은 로그인 후 사용할 수 있음.");
    const response = await fetch(`/api/community/${work.id}/favorite`, { method: "POST" });
    const data = await response.json();
    if (response.ok) setWork({ ...work, isFavorite: data.favorite });
  }

  async function rate(value: number) {
    if (!user || !work) return setMessage("별점은 로그인 후 남길 수 있음.");
    const response = await fetch(`/api/community/${work.id}/rating`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (response.ok) {
      setMessage(`${value}점으로 반영됨.`);
      await load();
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !work) return setMessage("댓글은 로그인 후 남길 수 있음.");
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "");
    const response = await fetch(`/api/community/${work.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "댓글을 남기지 못했음.");
    event.currentTarget.reset();
    setMessage("댓글을 남겼음.");
    await load();
  }

  return (
    <main className="library-shell public-work-shell">
      <GlobalSidebar user={user} active="community" setupRequired={setupRequired} />
      <section className="public-work-main">
        {!work ? (
          <div className="blank-state">{message || "작품을 불러오는 중…"}</div>
        ) : (
          <>
            <header className="work-hero">
              <img src={work.coverUrl || "/default-cover.png"} alt={`${work.title} 표지`} />
              <div className="work-hero-copy">
                <span className="work-genre">{work.genre}</span>
                <h1>{work.title}</h1>
                <p className="work-author">{work.authorName}</p>
                <p className="work-logline">{work.logline}</p>
                <div className="work-stats">
                  <strong><Star size={21} weight="fill" />{work.ratingCount ? work.ratingAverage.toFixed(1) : "평가 전"}</strong>
                  <span>{work.ratingCount}명 평가</span>
                  <span>{episodes.length}화 공개</span>
                </div>
                <div className="work-actions">
                  <button className={work.isFavorite ? "selected" : ""} onClick={toggleFavorite}>
                    <BookmarkSimple size={19} weight={work.isFavorite ? "fill" : "regular"} />
                    {work.isFavorite ? "선호작 해제" : "선호작 추가"}
                  </button>
                </div>
                <RatingPicker value={work.myRating} onRate={rate} />
                {message && <p className="inline-message">{message}</p>}
              </div>
            </header>

            <section className="episode-section">
              <div className="section-title"><div><p className="kicker">MANUSCRIPT</p><h2>공개 원고</h2></div><span>{episodes.length}편</span></div>
              <div className="episode-list">
                {episodes.map((episode) => {
                  const open = openEpisode === episode.id;
                  return (
                    <article className={`episode-card ${open ? "open" : ""}`} key={episode.id}>
                      <button className="episode-heading" onClick={() => setOpenEpisode(open ? null : episode.id)}>
                        <span>{episode.episode_no}화</span><strong>{episode.title}</strong><small>{open ? "접기" : "읽기"}</small>
                      </button>
                      {open && (
                        <div className="episode-body">
                          {episode.body.split(/\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                          <div className="episode-rating">
                            <strong>이 작품은 어땠나요?</strong>
                            <RatingPicker value={work.myRating} onRate={rate} compact />
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="comment-section">
              <div className="section-title"><div><p className="kicker">COMMENTS</p><h2>댓글</h2></div><span>{comments.length}개</span></div>
              <form className="comment-form" onSubmit={comment}>
                <ChatCircle size={22} />
                <textarea name="body" placeholder={user ? "작품에 대한 의견을 남겨 주세요." : "로그인 후 댓글을 남길 수 있음."} disabled={!user} maxLength={1000} />
                <button className="black-button" disabled={!user}>등록</button>
              </form>
              <div className="comments">
                {comments.map((item) => (
                  <article key={item.id}>
                    <div><strong>{item.display_name}</strong><span>@{item.username}</span><time>{formatDate(item.created_at)}</time></div>
                    <p>{item.body}</p>
                  </article>
                ))}
                {!comments.length && <div className="blank-state small">첫 댓글을 남겨 보세요.</div>}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function RatingPicker({ value, onRate, compact = false }: { value: number; onRate: (value: number) => void; compact?: boolean }) {
  return (
    <div className={`rating-picker ${compact ? "compact" : ""}`} aria-label="별점 선택">
      {!compact && <span>내 별점</span>}
      <div>
        {[1, 2, 3, 4, 5].map((score) => (
          <button key={score} type="button" onClick={() => onRate(score)} aria-label={`${score}점`}>
            <Star size={compact ? 22 : 26} weight={score <= value ? "fill" : "regular"} />
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ko", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
