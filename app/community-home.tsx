"use client";

import Link from "next/link";
import { BookmarkSimple, Star } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";
import type { CommunityWork } from "./community-data";

export function CommunityHome({
  user,
  setupRequired,
  initialWorks,
  preferred = false,
}: {
  user: SidebarUser;
  setupRequired: boolean;
  initialWorks: CommunityWork[];
  preferred?: boolean;
}) {
  const [sort, setSort] = useState<"rating" | "new">("rating");
  const [works, setWorks] = useState<CommunityWork[]>(initialWorks);
  const [error, setError] = useState("");
  const visibleWorks = useMemo(
    () => sortWorks(works, sort),
    [sort, works],
  );

  function changeSort(next: "rating" | "new") {
    setError("");
    setSort(next);
  }

  async function toggleFavorite(work: CommunityWork) {
    if (!user) {
      setError("선호작은 로그인 후 사용할 수 있음.");
      return;
    }
    const response = await fetch(`/api/community/${work.id}/favorite`, { method: "POST" });
    if (!response.ok) return;
    const data = await response.json();
    setWorks((current) =>
      preferred && !data.favorite
        ? current.filter((item) => item.id !== work.id)
        : current.map((item) => item.id === work.id ? { ...item, isFavorite: data.favorite } : item),
    );
  }

  return (
    <main className="library-shell community-shell">
      <GlobalSidebar user={user} active={preferred ? "preferred" : "community"} setupRequired={setupRequired} />
      <section className="community-main">
        <header className="community-header">
          <div>
            <p className="kicker">STORYYARD COMMUNITY</p>
            <h1>{preferred ? "선호작" : "전체장르"}</h1>
            <p>{preferred ? "다시 보고 싶은 공개 작품만 모아 둔 서재." : "작가들이 공개한 작품을 별점과 최신순으로 둘러봅니다."}</p>
          </div>
          {user && <Link className="black-button" href="/studio">＋ 내 작품 등록하기</Link>}
        </header>
        <div className="community-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="작품 정렬">
            <button className={sort === "rating" ? "active" : ""} onClick={() => changeSort("rating")}>랭킹순</button>
            <button className={sort === "new" ? "active" : ""} onClick={() => changeSort("new")}>신작순</button>
          </div>
          <span>{visibleWorks.length}작품</span>
        </div>
        {error && <div className="community-alert">{error}</div>}
        {visibleWorks.length ? (
          <div className="cover-grid">
            {visibleWorks.map((work, index) => (
              <article className="cover-card" key={work.id}>
                <Link className="cover-link" href={`/works/${work.slug}`} prefetch>
                  <div className="cover-frame">
                    <img src={work.coverUrl || "/default-cover.png"} alt={`${work.title} 표지`} />
                    <strong className="rank-badge">{sort === "rating" ? index + 1 : "NEW"}</strong>
                    <span className="episode-badge">{work.episodeCount}화</span>
                  </div>
                  <h2>{work.title}</h2>
                  <p>{work.authorName}</p>
                </Link>
                <div className="cover-meta">
                  <span><Star size={15} weight="fill" />{work.ratingCount ? work.ratingAverage.toFixed(1) : "–"} <small>({work.ratingCount})</small></span>
                  <button
                    type="button"
                    className={work.isFavorite ? "selected" : ""}
                    onClick={() => toggleFavorite(work)}
                    aria-label={`${work.title} 선호작 ${work.isFavorite ? "해제" : "추가"}`}
                  >
                    <BookmarkSimple size={18} weight={work.isFavorite ? "fill" : "regular"} />
                  </button>
                </div>
                <span className="cover-genre">{work.genre}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="blank-state community-empty">
            <strong>{preferred ? "아직 선호작이 없음." : "아직 공개된 작품이 없음."}</strong>
            <span>{preferred ? "작품의 북마크를 누르면 여기에 모임." : "개인 작업실에서 원고를 공개하면 첫 작품이 올라옴."}</span>
          </div>
        )}
      </section>
    </main>
  );
}

function sortWorks(works: CommunityWork[], sort: "rating" | "new") {
  return [...works].sort((left, right) => {
    const publishedDifference =
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    if (sort === "new") return publishedDifference;
    const qualificationDifference = Number(right.ranked) - Number(left.ranked);
    if (qualificationDifference) return qualificationDifference;
    if (left.ranked && right.ranked && right.ratingAverage !== left.ratingAverage) {
      return right.ratingAverage - left.ratingAverage;
    }
    if (right.ratingCount !== left.ratingCount) return right.ratingCount - left.ratingCount;
    return publishedDifference;
  });
}
