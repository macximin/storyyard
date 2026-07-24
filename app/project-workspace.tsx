"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type WorkspaceView = "overview" | "characters" | "plot" | "documents";
type Project = { id: string; title: string; logline: string; genre: string; favorite: number; updatedAt: string };
type Block = { id: string; act: number; kind: string; title: string; body: string; sortOrder: number };
type Item = { id: string; kind: string; title: string; body: string; meta: string };
type Draft = { id?: string; title: string; body: string; act?: number };

const actDefaults = [
  { title: "1막 · 각성", body: "세계가 흔들리고, 주인공이 이전으로 돌아갈 수 없게 된다." },
  { title: "2막 · 진실과 갈등", body: "목표를 향할수록 대가와 적의 정체가 선명해진다." },
  { title: "3막 · 결전과 선택", body: "가장 큰 대가 앞에서 주인공이 마지막 선택을 내린다." },
];

export function ProjectWorkspace({
  projectId,
  view,
  userName,
}: {
  projectId: string;
  view: WorkspaceView;
  userName: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragged, setDragged] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<Draft | null>(null);
  const [characterDraft, setCharacterDraft] = useState<Draft | null>(null);
  const [actDraft, setActDraft] = useState<Draft | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((response) => response.json()),
      fetch(`/api/projects/${projectId}/blocks`).then((response) => response.json()),
      fetch(`/api/projects/${projectId}/items`).then((response) => response.json()),
    ])
      .then(([projectData, blockData, itemData]) => {
        setProject(projectData.project ?? null);
        setBlocks(blockData.blocks ?? []);
        setItems(itemData.items ?? []);
        const firstDocument = (itemData.items ?? []).find((item: Item) => item.kind === "document");
        setDocumentId(firstDocument?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const characters = items.filter((item) => item.kind === "character");
  const documents = items.filter((item) => item.kind === "document");
  const actItems = items.filter((item) => item.kind === "act");
  const selectedDocument = documents.find((item) => item.id === documentId) ?? null;
  const columns = useMemo(
    () =>
      actDefaults.map((fallback, index) => {
        const act = index + 1;
        const saved = actItems.find((item) => readAct(item.meta) === act);
        return {
          act,
          title: saved?.title ?? fallback.title,
          body: saved?.body ?? fallback.body,
          item: saved,
          blocks: blocks
            .filter((block) => block.act === act)
            .sort((left, right) => left.sortOrder - right.sortOrder),
        };
      }),
    [actItems, blocks],
  );

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        logline: form.get("logline"),
        genre: form.get("genre"),
      }),
    });
    const data = await response.json();
    if (data.project) setProject(data.project);
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockDraft?.act) return;
    const endpoint = blockDraft.id
      ? `/api/blocks/${blockDraft.id}`
      : `/api/projects/${projectId}/blocks`;
    const response = await fetch(endpoint, {
      method: blockDraft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        act: blockDraft.act,
        title: blockDraft.title,
        body: blockDraft.body,
      }),
    });
    if (blockDraft.id) {
      setBlocks((current) =>
        current.map((block) => (block.id === blockDraft.id ? { ...block, ...blockDraft } : block)),
      );
    } else {
      const data = await response.json();
      if (data.block) setBlocks((current) => [...current, data.block]);
    }
    setBlockDraft(null);
  }

  async function moveBlock(act: number) {
    const block = blocks.find((item) => item.id === dragged);
    setDragged(null);
    if (!block || block.act === act) return;
    const sortOrder = Date.now();
    setBlocks((current) =>
      current.map((item) => (item.id === block.id ? { ...item, act, sortOrder } : item)),
    );
    await fetch(`/api/blocks/${block.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ act, sortOrder }),
    });
  }

  async function saveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!characterDraft) return;
    const endpoint = characterDraft.id
      ? `/api/items/${characterDraft.id}`
      : `/api/projects/${projectId}/items`;
    const response = await fetch(endpoint, {
      method: characterDraft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "character",
        title: characterDraft.title,
        body: characterDraft.body,
      }),
    });
    if (characterDraft.id) {
      setItems((current) =>
        current.map((item) => (item.id === characterDraft.id ? { ...item, ...characterDraft } : item)),
      );
    } else {
      const data = await response.json();
      if (data.item) setItems((current) => [...current, data.item]);
    }
    setCharacterDraft(null);
  }

  async function saveAct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actDraft?.act) return;
    const existing = actItems.find((item) => readAct(item.meta) === actDraft.act);
    const endpoint = existing ? `/api/items/${existing.id}` : `/api/projects/${projectId}/items`;
    const response = await fetch(endpoint, {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "act",
        title: actDraft.title,
        body: actDraft.body,
        meta: JSON.stringify({ act: actDraft.act }),
      }),
    });
    if (existing) {
      setItems((current) =>
        current.map((item) =>
          item.id === existing.id ? { ...item, title: actDraft.title, body: actDraft.body } : item,
        ),
      );
    } else {
      const data = await response.json();
      if (data.item) setItems((current) => [...current, data.item]);
    }
    setActDraft(null);
  }

  async function createDocument() {
    const response = await fetch(`/api/projects/${projectId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "document", title: "새 문서", body: "" }),
    });
    const data = await response.json();
    if (data.item) {
      setItems((current) => [...current, data.item]);
      setDocumentId(data.item.id);
    }
  }

  async function saveDocument(item: Item) {
    setItems((current) => current.map((value) => (value.id === item.id ? item : value)));
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: item.title, body: item.body }),
    });
  }

  if (loading) return <main className="loading-shell">작업실 불러오는 중…</main>;
  if (!project) return <main className="loading-shell">이 작품을 찾지 못했음.</main>;

  return (
    <main className="project-shell">
      <aside className="project-sidebar">
        <a className="back-home" href="/">← 내 작품</a>
        <div className="project-identity">
          <span>{project.genre}</span>
          <strong>{project.title}</strong>
        </div>
        <nav className="project-nav" aria-label="작품 메뉴">
          <a className={view === "overview" ? "active" : ""} href={`/project/${projectId}`}>◇ <span>작품 개요</span></a>
          <a className={view === "characters" ? "active" : ""} href={`/project/${projectId}/characters`}>♙ <span>등장인물</span><b>{characters.length}</b></a>
          <a className={view === "plot" ? "active" : ""} href={`/project/${projectId}/plot`}>▦ <span>플롯</span><b>{blocks.length}</b></a>
          <a className={view === "documents" ? "active" : ""} href={`/project/${projectId}/documents`}>□ <span>문서</span><b>{documents.length}</b></a>
        </nav>
        <div className="document-tree">
          {documents.slice(0, 7).map((document) => (
            <a href={`/project/${projectId}/documents`} key={document.id}>└ {document.title}</a>
          ))}
        </div>
        <div className="sidebar-user"><span>{userName.slice(0, 1)}</span>{userName}</div>
      </aside>

      <section className="project-main">
        {view === "overview" && (
          <Overview project={project} onSave={saveProject} />
        )}
        {view === "characters" && (
          <Characters
            characters={characters}
            onNew={() => setCharacterDraft({ title: "", body: "" })}
            onEdit={(item) => setCharacterDraft({ id: item.id, title: item.title, body: item.body })}
          />
        )}
        {view === "plot" && (
          <Plot
            project={project}
            columns={columns}
            onNewBlock={(act) => setBlockDraft({ act, title: "", body: "" })}
            onEditBlock={(block) => setBlockDraft({ id: block.id, act: block.act, title: block.title, body: block.body })}
            onEditAct={(draft) => setActDraft(draft)}
            onDrag={setDragged}
            onDrop={moveBlock}
          />
        )}
        {view === "documents" && (
          <Documents
            documents={documents}
            selected={selectedDocument}
            onSelect={setDocumentId}
            onNew={createDocument}
            onSave={saveDocument}
          />
        )}
      </section>

      {blockDraft && (
        <EditorModal title={blockDraft.id ? "블록 편집" : "새 블록"} draft={blockDraft} setDraft={setBlockDraft} onSubmit={saveBlock} onClose={() => setBlockDraft(null)} />
      )}
      {characterDraft && (
        <EditorModal title={characterDraft.id ? "인물 편집" : "새 인물"} draft={characterDraft} setDraft={setCharacterDraft} onSubmit={saveCharacter} onClose={() => setCharacterDraft(null)} />
      )}
      {actDraft && (
        <EditorModal title={`${actDraft.act}막 설정`} draft={actDraft} setDraft={setActDraft} onSubmit={saveAct} onClose={() => setActDraft(null)} />
      )}
    </main>
  );
}

function Overview({ project, onSave }: { project: Project; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="page-narrow">
      <PageHeader kicker="WORK OVERVIEW" title="작품 개요" description="작품의 중심 약속을 짧게 고정해 두는 곳." />
      <form className="overview-form" onSubmit={onSave}>
        <label>작품 제목<input name="title" defaultValue={project.title} /></label>
        <label>한 줄 소개<textarea name="logline" defaultValue={project.logline} /></label>
        <label>장르<input name="genre" defaultValue={project.genre} /></label>
        <button className="black-button" type="submit">변경사항 저장</button>
      </form>
    </div>
  );
}

function Characters({ characters, onNew, onEdit }: { characters: Item[]; onNew: () => void; onEdit: (item: Item) => void }) {
  return (
    <div className="page-wide">
      <PageHeader kicker="CHARACTERS" title={`등장인물 ${characters.length}`} description="욕망, 역할, 관계가 장면에서 바로 작동하게 정리." action={<button className="black-button" onClick={onNew}>＋ 새 인물</button>} />
      <div className="table-head"><span>이름</span><span>역할과 설명</span></div>
      <div className="character-list">
        {characters.map((character) => (
          <button className="character-row" key={character.id} onClick={() => onEdit(character)}>
            <strong>{character.title}</strong>
            <p>{character.body || "이 인물이 원하는 것과 방해받는 이유를 적어."}</p>
            <span>편집 →</span>
          </button>
        ))}
        {!characters.length && <div className="inline-empty">인물이 아직 없음. 주인공부터 박자.</div>}
      </div>
    </div>
  );
}

function Plot({
  project,
  columns,
  onNewBlock,
  onEditBlock,
  onEditAct,
  onDrag,
  onDrop,
}: {
  project: Project;
  columns: Array<{ act: number; title: string; body: string; item?: Item; blocks: Block[] }>;
  onNewBlock: (act: number) => void;
  onEditBlock: (block: Block) => void;
  onEditAct: (draft: Draft) => void;
  onDrag: (id: string) => void;
  onDrop: (act: number) => void;
}) {
  return (
    <div className="plot-page">
      <PageHeader kicker="PLOT BOARD" title={project.title} description={project.logline} />
      <div className="plot-board">
        {columns.map((column) => (
          <article className="act-column" key={column.act} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(column.act)}>
            <button className="act-heading" onClick={() => onEditAct({ act: column.act, title: column.title, body: column.body })}>
              <div><strong>{column.title}</strong><p>{column.body}</p></div>
              <span>{column.blocks.length}</span>
            </button>
            <div className="block-stack">
              {column.blocks.map((block) => (
                <button
                  className="plot-card"
                  key={block.id}
                  draggable
                  onDragStart={() => onDrag(block.id)}
                  onClick={() => onEditBlock(block)}
                >
                  <strong>{block.title}</strong>
                  <p>{block.body || "이 블록에서 벌어지는 사건을 적어."}</p>
                </button>
              ))}
            </div>
            <button className="add-block" onClick={() => onNewBlock(column.act)}>＋ 새 블록</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function Documents({
  documents,
  selected,
  onSelect,
  onNew,
  onSave,
}: {
  documents: Item[];
  selected: Item | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSave: (item: Item) => void;
}) {
  return (
    <div className="documents-page">
      <aside className="documents-list">
        <div><p className="kicker">DOCUMENTS</p><h1>문서</h1></div>
        <button className="outline-button" onClick={onNew}>＋ 새 문서</button>
        <div className="doc-links">
          {documents.map((document) => (
            <button className={document.id === selected?.id ? "active" : ""} key={document.id} onClick={() => onSelect(document.id)}>
              <span>□</span>{document.title}
            </button>
          ))}
        </div>
      </aside>
      {selected ? <DocumentEditor key={selected.id} item={selected} onSave={onSave} /> : <div className="document-blank">왼쪽에서 문서를 만들면 바로 쓸 수 있음.</div>}
    </div>
  );
}

function DocumentEditor({ item, onSave }: { item: Item; onSave: (item: Item) => void }) {
  const [draft, setDraft] = useState(item);
  return (
    <section className="document-editor">
      <div className="editor-toolbar"><span>{draft.body.length.toLocaleString()}자</span><button className="black-button small" onClick={() => onSave(draft)}>저장</button></div>
      <input aria-label="문서 제목" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <textarea aria-label="문서 내용" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="설정, 장면, 원고, 레퍼런스를 적는다." />
    </section>
  );
}

function PageHeader({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div><p className="kicker">{kicker}</p><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function EditorModal({
  title,
  draft,
  setDraft,
  onSubmit,
  onClose,
}: {
  title: string;
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal-card" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <label>제목<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>설명<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
        <button className="black-button" type="submit">저장</button>
      </form>
    </div>
  );
}

function readAct(meta: string) {
  try {
    return Number(JSON.parse(meta).act);
  } catch {
    return 0;
  }
}
