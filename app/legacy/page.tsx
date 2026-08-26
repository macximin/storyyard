import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { GlobalSidebar } from "@/app/global-sidebar";
import { getDb } from "@/db";
import { projects } from "@/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "이전 작품 — Storyyard" };

export default async function LegacyPage() {
  const user = await requireChatGPTUser("/legacy");
  if (user.role !== "admin") redirect("/");
  const rows = await getDb().select().from(projects).where(and(
    eq(projects.ownerEmail, user.email), eq(projects.lifecycle, "legacy"),
  )).orderBy(desc(projects.updatedAt));
  return <main className="library-shell legacy-shell">
    <GlobalSidebar user={user} active="legacy" />
    <section className="legacy-main">
      <header><p className="kicker">READ-ONLY ARCHIVE</p><h1>이전 작품</h1><p>V3 Foundry 체제에서 들어온 작품입니다. 삭제하지 않았고, Firefly 제작 화면에서는 분리했습니다.</p></header>
      <div className="legacy-list">{rows.map((project) => <article key={project.id}>
        <div><span>{project.genre}</span><h2>{project.title}</h2><p>{project.logline}</p></div>
        <aside><strong>읽기 전용</strong><small>{project.sourceSystem}</small><time>{project.updatedAt.slice(0, 10)}</time></aside>
      </article>)}</div>
      {rows.length === 0 && <p className="legacy-empty">보관된 이전 작품이 없습니다.</p>}
    </section>
  </main>;
}
