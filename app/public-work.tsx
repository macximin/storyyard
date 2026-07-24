"use client";

import { BookmarkSimple, Star } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { CommentThread } from "./comment-thread";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";
import type { PublicWorkSnapshot } from "./public-work-data";

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
      const data = await response.json() as { value: number; ratingAverage: number; ratingCount: number };
      setWork({
        ...work,
        myRating: data.value,
        ratingAverage: data.ratingAverage,
        ratingCount: data.ratingCount,
      });
      setMessage(`${value}점으로 반영됨.`);
    }
  }

  return (
    <main className="library-shell public-work-shell">
      <GlobalSidebar user={user} active="community" setupRequired={setupRequired} />
      <section className="public-work-main">
        {!work ? (
          <div className="blank-state">{message}</div>
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
                  const href = `/works/${work.slug}/episodes/${episode.episode_no}`;
                  return (
                    <article className="episode-card" key={episode.id}>
                      <Link
                        className="episode-heading"
                        href={href}
                        prefetch={false}
                      >
                        <span>{episode.episode_no}화</span><strong>{episode.title}</strong><small>읽기 →</small>
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>

            <CommentThread
              publicationId={work.id}
              initialComments={comments}
              user={user}
              title="작품 댓글"
            />
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
