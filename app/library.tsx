"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { GlobalSidebar, SidebarUser } from "./global-sidebar";
import { startNavigationProgress } from "./navigation-progress";

type Project = {
  id: string;
  title: string;
  logline: string;
  genre: string;
  favorite: number;
  updatedAt: string;
};

export function Library({
  user,
  initialProjects,
}: {
  user: Exclude<SidebarUser, null>;
  initialProjects: Project[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const filter: "all" | "favorites" =
    searchParams.get("filter") === "favorites" ? "favorites" : "all";
  const [creating, setCreating] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const visible = useMemo(
    () => projects.filter((project) => filter === "all" || project.favorite),
    [filter, projects],
  );

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        logline: form.get("logline"),
        genre: form.get("genre"),
      }),
    });
    const data = await response.json();
    if (data.project) {
      startNavigationProgress();
      router.push(`/project/${data.project.id}/plot`);
    }
  }

  async function toggleFavorite(project: Project) {
    const favorite = project.favorite ? 0 : 1;
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? { ...item, favorite } : item)),
    );
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorite }),
    });
  }

  function openDelete(project: Project) {
    setMenuProjectId(null);
    setDeletingProject(project);
    setDeleteConfirmation("");
    setDeleteError("");
  }

  function closeDelete() {
    if (deletePending) return;
    setDeletingProject(null);
    setDeleteConfirmation("");
    setDeleteError("");
  }

  async function deleteProject() {
    if (!deletingProject || deleteConfirmation !== deletingProject.title || deletePending) return;
    setDeletePending(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/projects/${deletingProject.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      setProjects((current) => current.filter((project) => project.id !== deletingProject.id));
      setDeletingProject(null);
      setDeleteConfirmation("");
    } catch {
      setDeleteError("삭제하지 못했음. 잠시 뒤 다시 시도해 줘.");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <main className="library-shell">
      <GlobalSidebar user={user} active={filter === "favorites" ? "studio-favorites" : "studio"} />

      <section className="library-main">
        <header className="library-header">
          <div>
            <p className="kicker">WRITING STUDIO</p>
            <h1>내 작품</h1>
            <p>작품을 고르면 등장인물, 플롯, 문서 작업실로 들어갑니다.</p>
          </div>
          <button className="black-button" onClick={() => setCreating(true)}>＋ 새 작품</button>
        </header>

        <div className="library-toolbar" id="favorites">
          <div className="filter-tabs" role="tablist" aria-label="작품 필터">
            <button className={filter === "all" ? "active" : ""} onClick={() => { startNavigationProgress(); router.replace("/studio"); }}>
              모든 작품 <b>{projects.length}</b>
            </button>
            <button className={filter === "favorites" ? "active" : ""} onClick={() => { startNavigationProgress(); router.replace("/studio?filter=favorites"); }}>
              즐겨찾기 <b>{projects.filter((project) => project.favorite).length}</b>
            </button>
          </div>
          <span className="sort-label">최근 편집순 ↓</span>
        </div>

        {visible.length ? (
          <div className="work-grid">
            {visible.map((project) => (
              <article className="work-card" key={project.id}>
                <div className="work-card-actions">
                  <button
                    className={`favorite-button ${project.favorite ? "selected" : ""}`}
                    aria-label={`${project.title} 즐겨찾기`}
                    onClick={() => toggleFavorite(project)}
                  >
                    {project.favorite ? "★" : "☆"}
                  </button>
                  <button
                    className="work-menu-button"
                    aria-label={`${project.title} 작품 관리`}
                    aria-expanded={menuProjectId === project.id}
                    onClick={() => setMenuProjectId((current) => current === project.id ? null : project.id)}
                  >
                    ···
                  </button>
                </div>
                {menuProjectId === project.id && (
                  <div className="work-card-menu">
                    <button type="button" onClick={() => openDelete(project)}>작품 삭제</button>
                  </div>
                )}
                <button
                  className="work-card-body"
                  onClick={() => {
                    startNavigationProgress();
                    router.push(`/project/${project.id}/plot`);
                  }}
                >
                  <span className="work-card-cover">
                    <img src="/default-cover.png" alt={`${project.title} 표지`} />
                    <span className="work-type">{project.genre}</span>
                  </span>
                  <span className="work-card-copy">
                    <h2>{project.title}</h2>
                    <p>{project.logline}</p>
                    <span className="edited-at">{formatDate(project.updatedAt)} 편집</span>
                  </span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="blank-state">
            <strong>{filter === "favorites" ? "즐겨찾기한 작품이 없음." : "아직 작품이 없음."}</strong>
            <span>{filter === "favorites" ? "별을 눌러 작업 우선순위를 박아 두면 됨." : "첫 작품부터 깔자."}</span>
          </div>
        )}
      </section>

      {creating && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreating(false)}>
          <form className="modal-card" onSubmit={createProject} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="kicker">NEW WORK</p><h2>새 작품</h2></div>
              <button type="button" className="icon-button" onClick={() => setCreating(false)}>×</button>
            </div>
            <label>작품 제목<input name="title" autoFocus required placeholder="제목을 입력" /></label>
            <label>한 줄 소개<textarea name="logline" placeholder="주인공, 목표, 압박을 한 줄로" /></label>
            <label>장르<input name="genre" defaultValue="웹소설" /></label>
            <button className="black-button" type="submit">작품 만들기</button>
          </form>
        </div>
      )}

      {deletingProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDelete}>
          <section
            className="modal-card confirm-modal project-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="kicker">DELETE WORK</p>
                <h2 id="project-delete-title">작품 삭제</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeDelete} aria-label="삭제 취소">×</button>
            </div>
            <p className="danger-summary">
              <strong>{deletingProject.title}</strong>과 연결된 등장인물, 플롯, 아크, 블록, 문서가 전부 삭제됨.
              이 작업은 되돌릴 수 없음.
            </p>
            <label className="delete-confirm-field">
              확인을 위해 작품 제목 입력
              <input
                autoFocus
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={deletingProject.title}
                aria-describedby={deleteError ? "project-delete-error" : undefined}
              />
            </label>
            {deleteError && <p className="delete-error" id="project-delete-error" role="alert">{deleteError}</p>}
            <div className="modal-actions">
              <button className="outline-cancel" type="button" onClick={closeDelete} disabled={deletePending}>취소</button>
              <button
                className="confirm-delete"
                type="button"
                onClick={deleteProject}
                disabled={deleteConfirmation !== deletingProject.title || deletePending}
              >
                {deletePending ? "삭제 중…" : "영구 삭제"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근";
  return new Intl.DateTimeFormat("ko", { month: "short", day: "numeric" }).format(date);
}
