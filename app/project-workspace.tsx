"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

export type WorkspaceView = "overview" | "characters" | "plot" | "documents";
type Project = { id: string; title: string; logline: string; genre: string; favorite: number; updatedAt: string };
type Block = { id: string; act: number; kind: string; title: string; body: string; meta: string; sortOrder: number };
type Item = { id: string; kind: string; title: string; body: string; meta: string };
type Draft = { id?: string; title: string; body: string; act?: number };
type BlockDraft = Draft & { act: number; characterIds: string[]; documentIds: string[] };
type FolderDraft = { id?: string; title: string };

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
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [draggedDocument, setDraggedDocument] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);
  const [characterDraft, setCharacterDraft] = useState<Draft | null>(null);
  const [actDraft, setActDraft] = useState<Draft | null>(null);
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [treeMenu, setTreeMenu] = useState<string | null>(null);
  const [treeAddOpen, setTreeAddOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((response) => response.json()),
      fetch(`/api/projects/${projectId}/blocks`).then((response) => response.json()),
      fetch(`/api/projects/${projectId}/items`).then((response) => response.json()),
    ])
      .then(([projectData, blockData, itemData]) => {
        const loadedItems: Item[] = itemData.items ?? [];
        const loadedDocuments = loadedItems.filter((item) => item.kind === "document");
        setProject(projectData.project ?? null);
        setBlocks(blockData.blocks ?? []);
        setItems(loadedItems);
        setOpenFolders(loadedItems.filter((item) => item.kind === "folder").map((item) => item.id));
        const requestedDocument =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("document") : null;
        setDocumentId(
          loadedDocuments.some((item) => item.id === requestedDocument)
            ? requestedDocument
            : loadedDocuments[0]?.id ?? null,
        );
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const characters = items.filter((item) => item.kind === "character");
  const documents = items.filter((item) => item.kind === "document");
  const folders = items.filter((item) => item.kind === "folder");
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
      body: JSON.stringify({ title: form.get("title"), logline: form.get("logline"), genre: form.get("genre") }),
    });
    const data = await response.json();
    if (data.project) setProject(data.project);
  }

  function inspectBlock(block: Block) {
    const links = readBlockLinks(block.meta);
    setBlockDraft({ id: block.id, act: block.act, title: block.title, body: block.body, ...links });
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockDraft) return;
    const endpoint = blockDraft.id ? `/api/blocks/${blockDraft.id}` : `/api/projects/${projectId}/blocks`;
    const meta = JSON.stringify({
      characterIds: blockDraft.characterIds,
      documentIds: blockDraft.documentIds,
    });
    const response = await fetch(endpoint, {
      method: blockDraft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ act: blockDraft.act, title: blockDraft.title, body: blockDraft.body, meta }),
    });
    if (blockDraft.id) {
      setBlocks((current) =>
        current.map((block) =>
          block.id === blockDraft.id
            ? { ...block, title: blockDraft.title, body: blockDraft.body, act: blockDraft.act, meta }
            : block,
        ),
      );
    } else {
      const data = await response.json();
      if (data.block) setBlocks((current) => [...current, data.block]);
    }
    setBlockDraft(null);
  }

  async function moveBlock(act: number) {
    const block = blocks.find((item) => item.id === draggedBlock);
    setDraggedBlock(null);
    if (!block || block.act === act) return;
    const sortOrder = Date.now();
    setBlocks((current) => current.map((item) => (item.id === block.id ? { ...item, act, sortOrder } : item)));
    await fetch(`/api/blocks/${block.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ act, sortOrder }),
    });
  }

  async function saveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!characterDraft) return;
    const endpoint = characterDraft.id ? `/api/items/${characterDraft.id}` : `/api/projects/${projectId}/items`;
    const response = await fetch(endpoint, {
      method: characterDraft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "character", title: characterDraft.title, body: characterDraft.body }),
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

  async function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderDraft?.title.trim()) return;
    const endpoint = folderDraft.id ? `/api/items/${folderDraft.id}` : `/api/projects/${projectId}/items`;
    const response = await fetch(endpoint, {
      method: folderDraft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "folder", title: folderDraft.title, body: "", meta: "{}" }),
    });
    if (folderDraft.id) {
      setItems((current) =>
        current.map((item) => (item.id === folderDraft.id ? { ...item, title: folderDraft.title } : item)),
      );
    } else {
      const data = await response.json();
      if (data.item) {
        setItems((current) => [...current, data.item]);
        setOpenFolders((current) => [...current, data.item.id]);
      }
    }
    setFolderDraft(null);
  }

  async function createDocument(folderId: string | null = null) {
    const response = await fetch(`/api/projects/${projectId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "document",
        title: "새 문서",
        body: "",
        meta: JSON.stringify({ folderId, sortOrder: Date.now() }),
      }),
    });
    const data = await response.json();
    if (data.item) {
      setItems((current) => [...current, data.item]);
      setDocumentId(data.item.id);
      setTreeAddOpen(false);
      setTreeMenu(null);
      if (folderId && !openFolders.includes(folderId)) setOpenFolders((current) => [...current, folderId]);
      if (view !== "documents") window.location.href = `/project/${projectId}/documents?document=${data.item.id}`;
    }
  }

  async function saveDocument(item: Item) {
    setItems((current) => current.map((value) => (value.id === item.id ? item : value)));
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: item.title, body: item.body, meta: item.meta }),
    });
  }

  async function moveDocument(item: Item, folderId: string | null) {
    const meta = JSON.stringify({ ...readObject(item.meta), folderId, sortOrder: Date.now() });
    setItems((current) => current.map((value) => (value.id === item.id ? { ...value, meta } : value)));
    setTreeMenu(null);
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meta }),
    });
  }

  async function dropDocument(folderId: string | null) {
    const document = documents.find((item) => item.id === draggedDocument);
    setDraggedDocument(null);
    if (document) await moveDocument(document, folderId);
  }

  async function deleteItem(item: Item) {
    if (!window.confirm(`${item.title}을(를) 삭제할까?`)) return;
    if (item.kind === "folder") {
      const children = documents.filter((document) => documentFolder(document) === item.id);
      await Promise.all(children.map((document) => moveDocument(document, null)));
    }
    await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    setItems((current) => current.filter((value) => value.id !== item.id));
    if (documentId === item.id) setDocumentId(documents.find((value) => value.id !== item.id)?.id ?? null);
    setTreeMenu(null);
  }

  function selectDocument(id: string) {
    setDocumentId(id);
    if (view !== "documents") window.location.href = `/project/${projectId}/documents?document=${id}`;
  }

  if (loading) return <main className="loading-shell">작업실 불러오는 중…</main>;
  if (!project) return <main className="loading-shell">이 작품을 찾지 못했음.</main>;

  return (
    <main className="project-shell">
      <ProjectSidebar
        project={project}
        projectId={projectId}
        view={view}
        userName={userName}
        blocks={blocks}
        characters={characters}
        documents={documents}
        folders={folders}
        documentId={documentId}
        openFolders={openFolders}
        treeMenu={treeMenu}
        treeAddOpen={treeAddOpen}
        onToggleFolder={(id) =>
          setOpenFolders((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
          )
        }
        onToggleTreeMenu={(id) => setTreeMenu((current) => (current === id ? null : id))}
        onToggleTreeAdd={() => setTreeAddOpen((current) => !current)}
        onCreateFolder={() => { setFolderDraft({ title: "새 폴더" }); setTreeAddOpen(false); }}
        onRenameFolder={(folder) => setFolderDraft({ id: folder.id, title: folder.title })}
        onCreateDocument={createDocument}
        onSelectDocument={selectDocument}
        onMoveDocument={moveDocument}
        onDeleteItem={deleteItem}
        onDragDocument={setDraggedDocument}
        onDropDocument={dropDocument}
      />

      <section className="project-main">
        {view === "overview" && <Overview project={project} onSave={saveProject} />}
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
            onNewBlock={(act) =>
              setBlockDraft({ act, title: "", body: "", characterIds: [], documentIds: [] })
            }
            onInspectBlock={inspectBlock}
            onEditAct={setActDraft}
            onDrag={setDraggedBlock}
            onDrop={moveBlock}
          />
        )}
        {view === "documents" && (
          <Documents selected={selectedDocument} onSave={saveDocument} onNew={() => createDocument(null)} />
        )}
      </section>

      {blockDraft && (
        <BlockInspector
          draft={blockDraft}
          actTitle={columns[blockDraft.act - 1]?.title ?? `${blockDraft.act}막`}
          characters={characters}
          documents={documents}
          setDraft={setBlockDraft}
          onSubmit={saveBlock}
          onClose={() => setBlockDraft(null)}
        />
      )}
      {characterDraft && (
        <EditorModal title={characterDraft.id ? "인물 편집" : "새 인물"} draft={characterDraft} setDraft={setCharacterDraft} onSubmit={saveCharacter} onClose={() => setCharacterDraft(null)} />
      )}
      {actDraft && (
        <EditorModal title={`${actDraft.act}막 설정`} draft={actDraft} setDraft={setActDraft} onSubmit={saveAct} onClose={() => setActDraft(null)} />
      )}
      {folderDraft && (
        <NameModal draft={folderDraft} setDraft={setFolderDraft} onSubmit={saveFolder} onClose={() => setFolderDraft(null)} />
      )}
    </main>
  );
}

function ProjectSidebar(props: {
  project: Project;
  projectId: string;
  view: WorkspaceView;
  userName: string;
  blocks: Block[];
  characters: Item[];
  documents: Item[];
  folders: Item[];
  documentId: string | null;
  openFolders: string[];
  treeMenu: string | null;
  treeAddOpen: boolean;
  onToggleFolder: (id: string) => void;
  onToggleTreeMenu: (id: string) => void;
  onToggleTreeAdd: () => void;
  onCreateFolder: () => void;
  onRenameFolder: (item: Item) => void;
  onCreateDocument: (folderId: string | null) => void;
  onSelectDocument: (id: string) => void;
  onMoveDocument: (item: Item, folderId: string | null) => void;
  onDeleteItem: (item: Item) => void;
  onDragDocument: (id: string) => void;
  onDropDocument: (folderId: string | null) => void;
}) {
  const unfiled = props.documents.filter((document) => !documentFolder(document));
  return (
    <aside className="project-sidebar">
      <a className="back-home" href="/">⌂ 홈으로</a>
      <div className="project-identity"><span>{props.project.genre}</span><strong>{props.project.title}</strong></div>
      <label className="sidebar-search">⌕<input placeholder="검색…" aria-label="작품 검색" /></label>
      <nav className="project-nav" aria-label="작품 메뉴">
        <a className={props.view === "overview" ? "active" : ""} href={`/project/${props.projectId}`}>◇ <span>작품 개요</span></a>
        <a className={props.view === "characters" ? "active" : ""} href={`/project/${props.projectId}/characters`}>♙ <span>등장인물</span><b>{props.characters.length}</b></a>
        <a className={props.view === "plot" ? "active" : ""} href={`/project/${props.projectId}/plot`}>▦ <span>플롯</span><b>{props.blocks.length}</b></a>
      </nav>

      <section
        className="sidebar-documents"
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => props.onDropDocument(null)}
      >
        <div className="tree-heading">
          <strong>문서</strong>
          <button aria-label="문서 또는 폴더 추가" onClick={props.onToggleTreeAdd}>＋</button>
          {props.treeAddOpen && (
            <div className="tree-popover add-menu">
              <button onClick={() => props.onCreateDocument(null)}>□ 새 문서</button>
              <button onClick={props.onCreateFolder}>▱ 새 폴더</button>
            </div>
          )}
        </div>
        <div className="file-tree" role="tree">
          {props.folders.map((folder) => {
            const isOpen = props.openFolders.includes(folder.id);
            const folderDocuments = props.documents.filter((document) => documentFolder(document) === folder.id);
            const menuId = `folder:${folder.id}`;
            return (
              <div className="tree-folder" key={folder.id} role="treeitem" aria-expanded={isOpen}>
                <div
                  className="tree-row folder-row"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.stopPropagation(); props.onDropDocument(folder.id); }}
                >
                  <button className="tree-main" onClick={() => props.onToggleFolder(folder.id)}>
                    <span>{isOpen ? "⌄" : "›"}</span><span>▱</span><strong>{folder.title}</strong>
                  </button>
                  <button className="tree-more" aria-label={`${folder.title} 관리`} onClick={() => props.onToggleTreeMenu(menuId)}>···</button>
                  {props.treeMenu === menuId && (
                    <div className="tree-popover">
                      <button onClick={() => props.onCreateDocument(folder.id)}>＋ 문서 추가</button>
                      <button onClick={() => props.onRenameFolder(folder)}>이름 변경</button>
                      <button className="danger" onClick={() => props.onDeleteItem(folder)}>폴더 삭제</button>
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="tree-children" role="group">
                    {folderDocuments.map((document) => (
                      <TreeDocument key={document.id} document={document} folders={props.folders} active={document.id === props.documentId} menuOpen={props.treeMenu === `document:${document.id}`} onSelect={props.onSelectDocument} onMenu={props.onToggleTreeMenu} onMove={props.onMoveDocument} onDelete={props.onDeleteItem} onDrag={props.onDragDocument} />
                    ))}
                    {!folderDocuments.length && <span className="tree-empty">비어 있음</span>}
                  </div>
                )}
              </div>
            );
          })}
          {unfiled.map((document) => (
            <TreeDocument key={document.id} document={document} folders={props.folders} active={document.id === props.documentId} menuOpen={props.treeMenu === `document:${document.id}`} onSelect={props.onSelectDocument} onMenu={props.onToggleTreeMenu} onMove={props.onMoveDocument} onDelete={props.onDeleteItem} onDrag={props.onDragDocument} />
          ))}
          {!props.folders.length && !props.documents.length && <span className="tree-empty root">＋ 버튼으로 문서나 폴더를 추가</span>}
        </div>
      </section>
      <div className="sidebar-user"><span>{props.userName.slice(0, 1)}</span>{props.userName}</div>
    </aside>
  );
}

function TreeDocument(props: {
  document: Item;
  folders: Item[];
  active: boolean;
  menuOpen: boolean;
  onSelect: (id: string) => void;
  onMenu: (id: string) => void;
  onMove: (item: Item, folderId: string | null) => void;
  onDelete: (item: Item) => void;
  onDrag: (id: string) => void;
}) {
  return (
    <div className={`tree-row document-row ${props.active ? "active" : ""}`} role="treeitem" draggable onDragStart={() => props.onDrag(props.document.id)}>
      <button className="tree-main" onClick={() => props.onSelect(props.document.id)}><span>□</span><span>{props.document.title}</span></button>
      <button className="tree-more" aria-label={`${props.document.title} 관리`} onClick={() => props.onMenu(`document:${props.document.id}`)}>···</button>
      {props.menuOpen && (
        <div className="tree-popover">
          <label>이동
            <select value={documentFolder(props.document) ?? ""} onChange={(event) => props.onMove(props.document, event.target.value || null)}>
              <option value="">최상위</option>
              {props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
            </select>
          </label>
          <button className="danger" onClick={() => props.onDelete(props.document)}>문서 삭제</button>
        </div>
      )}
    </div>
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
            <strong>{character.title}</strong><p>{character.body || "이 인물이 원하는 것과 방해받는 이유를 적어."}</p><span>편집 →</span>
          </button>
        ))}
        {!characters.length && <div className="inline-empty">인물이 아직 없음. 주인공부터 박자.</div>}
      </div>
    </div>
  );
}

function Plot(props: {
  project: Project;
  columns: Array<{ act: number; title: string; body: string; blocks: Block[] }>;
  onNewBlock: (act: number) => void;
  onInspectBlock: (block: Block) => void;
  onEditAct: (draft: Draft) => void;
  onDrag: (id: string) => void;
  onDrop: (act: number) => void;
}) {
  return (
    <div className="plot-page">
      <PageHeader kicker="PLOT BOARD" title={props.project.title} description={props.project.logline} />
      <div className="plot-board">
        {props.columns.map((column) => (
          <article className="act-column" key={column.act} onDragOver={(event) => event.preventDefault()} onDrop={() => props.onDrop(column.act)}>
            <button className="act-heading" onClick={() => props.onEditAct({ act: column.act, title: column.title, body: column.body })}>
              <div><strong>{column.title}</strong><p>{column.body}</p></div><span>{column.blocks.length}</span>
            </button>
            <div className="block-stack">
              {column.blocks.map((block) => {
                const links = readBlockLinks(block.meta);
                return (
                  <button className="plot-card" key={block.id} draggable onDragStart={() => props.onDrag(block.id)} onClick={() => props.onInspectBlock(block)}>
                    <strong>{block.title}</strong>
                    <p>{block.body || "이 블록에서 벌어지는 사건을 적어."}</p>
                    {(links.characterIds.length > 0 || links.documentIds.length > 0) && (
                      <span className="plot-card-links">인물 {links.characterIds.length} · 문서 {links.documentIds.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button className="add-block" onClick={() => props.onNewBlock(column.act)}>＋ 새 블록</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function Documents({ selected, onSave, onNew }: { selected: Item | null; onSave: (item: Item) => void; onNew: () => void }) {
  return (
    <div className="documents-page">
      {selected ? <DocumentEditor key={selected.id} item={selected} onSave={onSave} /> : (
        <div className="document-blank"><strong>문서가 아직 없음.</strong><button className="black-button" onClick={onNew}>＋ 새 문서</button></div>
      )}
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

function BlockInspector(props: {
  draft: BlockDraft;
  actTitle: string;
  characters: Item[];
  documents: Item[];
  setDraft: (draft: BlockDraft | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  function toggle(key: "characterIds" | "documentIds", id: string) {
    const values = props.draft[key];
    props.setDraft({ ...props.draft, [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id] });
  }
  return (
    <div className="inspector-backdrop" role="presentation" onMouseDown={props.onClose}>
      <aside className="block-inspector" onMouseDown={(event) => event.stopPropagation()}>
        <form onSubmit={props.onSubmit}>
          <div className="inspector-top"><button type="button" onClick={props.onClose}>»</button><span>블록 상세</span><button type="button">···</button></div>
          <p className="inspector-breadcrumb">↳ {props.actTitle}</p>
          <input className="inspector-title" aria-label="블록 제목" autoFocus value={props.draft.title} onChange={(event) => props.setDraft({ ...props.draft, title: event.target.value })} placeholder="새 블록" />
          <InspectorSection title="내용">
            <textarea value={props.draft.body} onChange={(event) => props.setDraft({ ...props.draft, body: event.target.value })} placeholder="내용을 입력하세요…" />
          </InspectorSection>
          <InspectorSection title="등장인물">
            <div className="link-picker">
              {props.characters.map((character) => (
                <label key={character.id}><input type="checkbox" checked={props.draft.characterIds.includes(character.id)} onChange={() => toggle("characterIds", character.id)} /><span>{character.title}</span></label>
              ))}
              {!props.characters.length && <span className="picker-empty">등장인물이 비어 있음</span>}
            </div>
          </InspectorSection>
          <InspectorSection title="문서">
            <div className="link-picker">
              {props.documents.map((document) => (
                <label key={document.id}><input type="checkbox" checked={props.draft.documentIds.includes(document.id)} onChange={() => toggle("documentIds", document.id)} /><span>{document.title}</span></label>
              ))}
              {!props.documents.length && <span className="picker-empty">문서가 비어 있음</span>}
            </div>
          </InspectorSection>
          <div className="inspector-save"><button className="black-button" type="submit">블록 저장</button></div>
        </form>
      </aside>
    </div>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="inspector-section"><strong>{title}</strong>{children}</section>;
}

function PageHeader({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><p className="kicker">{kicker}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function EditorModal(props: {
  title: string;
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="modal-card" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2>{props.title}</h2><button type="button" className="icon-button" onClick={props.onClose}>×</button></div>
        <label>제목<input autoFocus value={props.draft.title} onChange={(event) => props.setDraft({ ...props.draft, title: event.target.value })} /></label>
        <label>설명<textarea value={props.draft.body} onChange={(event) => props.setDraft({ ...props.draft, body: event.target.value })} /></label>
        <button className="black-button" type="submit">저장</button>
      </form>
    </div>
  );
}

function NameModal(props: {
  draft: FolderDraft;
  setDraft: (draft: FolderDraft | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="modal-card name-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2>{props.draft.id ? "폴더 이름 변경" : "새 폴더"}</h2><button type="button" className="icon-button" onClick={props.onClose}>×</button></div>
        <label>폴더 이름<input autoFocus value={props.draft.title} onChange={(event) => props.setDraft({ ...props.draft, title: event.target.value })} /></label>
        <button className="black-button" type="submit">저장</button>
      </form>
    </div>
  );
}

function readAct(meta: string) {
  return Number(readObject(meta).act ?? 0);
}

function documentFolder(item: Item) {
  const value = readObject(item.meta).folderId;
  return typeof value === "string" && value ? value : null;
}

function readBlockLinks(meta: string) {
  const value = readObject(meta);
  return {
    characterIds: Array.isArray(value.characterIds) ? value.characterIds.filter((id): id is string => typeof id === "string") : [],
    documentIds: Array.isArray(value.documentIds) ? value.documentIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function readObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
