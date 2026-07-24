"use client";

import { useEffect, useState } from "react";
import { GlobalSidebar, SidebarUser } from "@/app/global-sidebar";

type AdminData = {
  users: Array<Record<string, string>>;
  works: Array<Record<string, string | number>>;
  comments: Array<Record<string, string>>;
};

export function AdminClient({ user }: { user: Exclude<SidebarUser, null> }) {
  const [data, setData] = useState<AdminData>({ users: [], works: [], comments: [] });
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/admin");
    if (response.ok) setData(await response.json());
  }
  useEffect(() => {
    let active = true;
    fetch("/api/admin")
      .then(async (response) => {
        if (response.ok && active) setData(await response.json());
      });
    return () => { active = false; };
  }, []);
  async function update(kind: "work" | "comment", id: string, status: string) {
    const response = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, status }),
    });
    setMessage(response.ok ? "운영 상태를 반영했음." : "반영하지 못했음.");
    await load();
  }
  return (
    <main className="library-shell">
      <GlobalSidebar user={user} active="admin" />
      <section className="admin-main">
        <header className="community-header"><div><p className="kicker">ADMIN</p><h1>운영 관리</h1><p>회원, 공개 작품, 댓글을 한곳에서 관리합니다.</p></div></header>
        {message && <div className="community-alert">{message}</div>}
        <div className="admin-metrics">
          <article><span>회원</span><strong>{data.users.length}</strong></article>
          <article><span>등록 작품</span><strong>{data.works.length}</strong></article>
          <article><span>댓글</span><strong>{data.comments.length}</strong></article>
        </div>
        <section className="admin-section">
          <h2>공개 작품</h2>
          <div className="admin-list">
            {data.works.map((work) => (
              <article key={String(work.id)}>
                <div><strong>{String(work.title)}</strong><span>{String(work.author_name)} · ★ {Number(work.rating_average ?? 0).toFixed(1)} ({String(work.rating_count)})</span></div>
                <button onClick={() => update("work", String(work.id), work.status === "published" ? "hidden" : "published")}>{work.status === "published" ? "숨기기" : "공개"}</button>
              </article>
            ))}
          </div>
        </section>
        <section className="admin-section">
          <h2>최근 댓글</h2>
          <div className="admin-list">
            {data.comments.map((comment) => (
              <article key={comment.id}>
                <div><strong>{comment.work_title} · {comment.display_name}</strong><span>{comment.body}</span></div>
                <button onClick={() => update("comment", comment.id, comment.status === "visible" ? "hidden" : "visible")}>{comment.status === "visible" ? "숨기기" : "복구"}</button>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
