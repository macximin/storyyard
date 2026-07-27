"use client";

import { ArrowLeft, ArrowRight, ChatCircle, List, X } from "@phosphor-icons/react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { CommentThread } from "./comment-thread";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";
import { usePublicationRefresh } from "./publication-events";
import type { PublicEpisodeSnapshot } from "./public-episode-data";

export function PublicEpisodeReader({
  user,
  setupRequired,
  snapshot,
}: {
  user: SidebarUser;
  setupRequired: boolean;
  snapshot: PublicEpisodeSnapshot | null;
}) {
  const [tocOpen, setTocOpen] = useState(false);
  usePublicationRefresh();

  if (!snapshot) {
    return (
      <main className="library-shell">
        <GlobalSidebar user={user} active="community" setupRequired={setupRequired} />
        <section className="public-work-main"><div className="blank-state">공개된 회차를 찾지 못했음.</div></section>
      </main>
    );
  }

  const { work, episode, episodes, comments } = snapshot;
  const index = episodes.findIndex((item) => item.id === episode.id);
  const previous = index > 0 ? episodes[index - 1] : null;
  const next = index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : null;
  const episodeHref = (episodeNo: number) => `/works/${work.slug}/episodes/${episodeNo}`;
  const proseParagraphs = episode.body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .filter(Boolean);

  return (
    <main className="library-shell reader-page-shell">
      <GlobalSidebar user={user} active="community" setupRequired={setupRequired} />
      <section className="reader-main">
        <button className="reader-toc-toggle" type="button" onClick={() => setTocOpen(true)}>
          <List size={18} /> 목차
        </button>
        {tocOpen && <button className="reader-toc-scrim" aria-label="목차 닫기" onClick={() => setTocOpen(false)} />}
        <aside className={`reader-toc ${tocOpen ? "open" : ""}`}>
          <div className="reader-toc-head">
            <Link href={`/works/${work.slug}`}><ArrowLeft size={16} /> 작품으로</Link>
            <button type="button" onClick={() => setTocOpen(false)} aria-label="목차 닫기"><X size={18} /></button>
          </div>
          <div className="reader-work-title">
            <span>{work.authorName}</span>
            <strong>{work.title}</strong>
          </div>
          <nav aria-label="회차 목차">
            {episodes.map((item) => (
              <Link
                key={item.id}
                className={item.id === episode.id ? "active" : ""}
                href={episodeHref(item.episode_no)}

                onClick={() => setTocOpen(false)}
              >
                <span>{item.episode_no}화</span>
                <strong>{item.title}</strong>
                {item.comment_count > 0 && <small><ChatCircle size={12} />{item.comment_count}</small>}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="reader-content">
          <header className="reader-header">
            <Link href={`/works/${work.slug}`}>{work.title}</Link>
            <span>{episode.episode_no}화</span>
            <h1>{episode.title}</h1>
            <time>{formatDate(episode.published_at)}</time>
          </header>
          <div className="reader-prose">
            {proseParagraphs.map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex}>
                {paragraph.split("\n").map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </p>
            ))}
          </div>
          <nav className="reader-pagination" aria-label="이전 및 다음 회차">
            {previous ? (
              <Link
                href={episodeHref(previous.episode_no)}

              >
                <ArrowLeft size={18} /><span><small>이전화</small>{previous.title}</span>
              </Link>
            ) : <span />}
            {next ? (
              <Link
                className="next"
                href={episodeHref(next.episode_no)}

              >
                <span><small>다음화</small>{next.title}</span><ArrowRight size={18} />
              </Link>
            ) : <span />}
          </nav>
          <CommentThread
            publicationId={work.id}
            episodeId={episode.id}
            initialComments={comments}
            user={user}
            title={`${episode.episode_no}화 댓글`}
          />
        </article>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ko", { year: "numeric", month: "long", day: "numeric" }).format(date);
}
