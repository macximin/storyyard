"use client";

import { ChatCircle, Trash } from "@phosphor-icons/react";
import { FormEvent, useState } from "react";
import type { SidebarUser } from "./global-sidebar";

export type PublicComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
  username: string;
};

export function CommentThread({
  publicationId,
  episodeId,
  initialComments,
  user,
  title = "댓글",
}: {
  publicationId: string;
  episodeId?: string;
  initialComments: PublicComment[];
  user: SidebarUser;
  title?: string;
}) {
  const [comments, setComments] = useState(initialComments);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return setMessage("댓글은 로그인 후 남길 수 있음.");
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setPending(true);
    setMessage("");
    const endpoint = episodeId
      ? `/api/community/${publicationId}/episodes/${episodeId}/comments`
      : `/api/community/${publicationId}/comments`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await response.json() as { comment?: PublicComment; error?: string };
      if (!response.ok || !data.comment) {
        setMessage(data.error || "댓글을 남기지 못했음.");
        return;
      }
      form.reset();
      setComments((current) => [data.comment!, ...current]);
      setMessage("댓글을 남겼음.");
    } catch {
      setMessage("연결이 끊겼음. 잠시 뒤 다시 시도해 줘.");
    } finally {
      setPending(false);
    }
  }

  async function remove(comment: PublicComment) {
    if (!window.confirm("이 댓글을 삭제할까?")) return;
    const response = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setMessage(data.error || "댓글을 삭제하지 못했음.");
      return;
    }
    setComments((current) => current.filter((item) => item.id !== comment.id));
    setMessage("댓글을 삭제했음.");
  }

  return (
    <section className="comment-section">
      <div className="section-title">
        <div><p className="kicker">COMMENTS</p><h2>{title}</h2></div>
        <span>{comments.length}개</span>
      </div>
      <form className="comment-form" onSubmit={submit}>
        <ChatCircle size={22} />
        <textarea
          name="body"
          placeholder={user ? "읽은 감상을 남겨 주세요." : "로그인 후 댓글을 남길 수 있음."}
          disabled={!user || pending}
          maxLength={1000}
        />
        <button className="black-button" disabled={!user || pending}>
          {pending ? "등록 중…" : "등록"}
        </button>
      </form>
      {message && <p className="inline-message" role="status">{message}</p>}
      <div className="comments">
        {comments.map((item) => {
          const canDelete = Boolean(user && (user.role === "admin" || user.id === item.user_id));
          return (
            <article key={item.id}>
              <div>
                <strong>{item.display_name}</strong>
                <span>@{item.username}</span>
                <time>{formatDate(item.created_at)}</time>
                {canDelete && (
                  <button className="comment-delete" type="button" onClick={() => remove(item)} aria-label="댓글 삭제">
                    <Trash size={15} /> 삭제
                  </button>
                )}
              </div>
              <p>{item.body}</p>
            </article>
          );
        })}
        {!comments.length && <div className="blank-state small">첫 댓글을 남겨 보세요.</div>}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ko", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
