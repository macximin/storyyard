"use client";

import { useEffect, useMemo, useState } from "react";

type Project = { id: string; title: string; logline: string; genre: string; updatedAt: string };
type Block = { id: string; act: number; kind: string; title: string; body: string; sortOrder: number };

const acts = [
  { id: 1, name: "1막 · 각성", prompt: "출발 사건과 즉시 목표를 잡는다." },
  { id: 2, name: "2막 · 진실과 갈등", prompt: "목표의 대가와 반대 압력을 건다." },
  { id: 3, name: "3막 · 결전과 선택", prompt: "최종 선택과 결말 보상을 박는다." },
];

export function Storyyard({ userName }: { userName: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragged, setDragged] = useState<string | null>(null);

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    setActiveId((current) => current ?? data.projects?.[0]?.id ?? null);
    setLoading(false);
  }
  async function loadBlocks(projectId: string) {
    const res = await fetch(`/api/projects/${projectId}/blocks`);
    const data = await res.json();
    setBlocks(data.blocks ?? []);
  }
  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (activeId) loadBlocks(activeId); else setBlocks([]); }, [activeId]);

  const active = projects.find((project) => project.id === activeId);
  const byAct = useMemo(() => acts.map((act) => ({ ...act, blocks: blocks.filter((block) => block.act === act.id).sort((a, b) => a.sortOrder - b.sortOrder) })), [blocks]);

  async function createProject() {
    const title = window.prompt("작품 제목", "새 작품");
    if (!title) return;
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    const data = await res.json();
    if (data.project) { setProjects((items) => [data.project, ...items]); setActiveId(data.project.id); }
  }
  async function createBlock(act: number) {
    if (!activeId) return;
    const res = await fetch(`/api/projects/${activeId}/blocks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ act, title: "새 블록", body: "이 장면에서 무슨 일이 일어나는지 적어 보세요." }) });
    const data = await res.json();
    if (data.block) setBlocks((items) => [...items, data.block]);
  }
  async function moveBlock(targetAct: number) {
    if (!dragged) return;
    const block = blocks.find((item) => item.id === dragged);
    if (!block || block.act === targetAct) { setDragged(null); return; }
    setBlocks((items) => items.map((item) => item.id === dragged ? { ...item, act: targetAct, sortOrder: Date.now() } : item));
    setDragged(null);
    await fetch(`/api/blocks/${block.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ act: targetAct, sortOrder: Date.now() }) });
  }
  async function editBlock(block: Block) {
    const title = window.prompt("블록 제목", block.title);
    if (title === null) return;
    const body = window.prompt("블록 내용", block.body);
    if (body === null) return;
    const next = { ...block, title: title.trim() || "새 블록", body: body.trim() };
    setBlocks((items) => items.map((item) => item.id === block.id ? next : item));
    await fetch(`/api/blocks/${block.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: next.title, body: next.body }) });
  }

  if (loading) return <main className="loading-shell">작업판 불러오는 중…</main>;

  return (
    <main className="studio-shell">
      <aside className="sidebar">
        <div className="brand">STORYYARD</div>
        <div className="profile">{userName.slice(0, 1).toUpperCase()} <span>{userName}</span></div>
        <button className="new-work" onClick={createProject}>＋ 새 작품</button>
        <p className="side-label">내 작품</p>
        <nav>{projects.map((project) => <button key={project.id} className={project.id === activeId ? "project-link active" : "project-link"} onClick={() => setActiveId(project.id)}><strong>{project.title}</strong><small>{project.genre}</small></button>)}</nav>
      </aside>
      <section className="workspace">
        {!active ? <EmptyState onCreate={createProject} /> : <>
          <header className="workspace-header"><div><p className="eyebrow">개인 작업실</p><h1>{active.title}</h1><p>{active.logline}</p></div><div className="view-switch"><button className="selected">플롯</button><button disabled>등장인물</button><button disabled>문서</button></div></header>
          <section className="plot-board">
            {byAct.map((act) => <article key={act.id} className="act-column" onDragOver={(event) => event.preventDefault()} onDrop={() => moveBlock(act.id)}>
              <div className="act-head"><span>{act.name}</span><em>{act.blocks.length}</em></div>
              <p className="act-prompt">{act.prompt}</p>
              <div className="block-stack">{act.blocks.map((block) => <button key={block.id} draggable onDragStart={() => setDragged(block.id)} onClick={() => editBlock(block)} className={block.kind === "hook" ? "plot-card hook" : "plot-card"}><strong>{block.title}</strong><span>{block.body || "내용을 적어 보세요."}</span></button>)}</div>
              <button className="add-block" onClick={() => createBlock(act.id)}>＋ 새 블록</button>
            </article>)}
          </section>
        </>}
      </section>
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) { return <section className="empty-state"><p className="eyebrow">STORYYARD</p><h1>첫 작품부터 깔자.</h1><p>작품을 만들면 3막 플롯 보드가 바로 열린다.</p><button className="primary-button" onClick={onCreate}>새 작품 만들기</button></section>; }
