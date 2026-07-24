"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

export type WorkspaceView = "overview" | "characters" | "plot" | "documents";
type Project = { id: string; title: string; logline: string; genre: string; favorite: number; updatedAt: string };
type Block = { id: string; act: number; kind: string; title: string; body: string; meta: string; sortOrder: number };
type Item = { id: string; kind: string; title: string; body: string; meta: string; updatedAt?: string };
type Draft = { id?: string; title: string; body: string; act?: number };
type BlockDraft = Draft & { act: number; characterIds: string[]; documentIds: string[] };
type CharacterDraft = { id?: string; title: string; body: string; meta: string };
type CharacterField = { id: string; label: string; value: string };
type CharacterMeta = {
  tags: string[];
  pinned: boolean;
  avatar: string;
  fields: CharacterField[];
  sortOrder: number;
};
type SaveStatus = "idle" | "saving" | "saved" | "error" | "recovered";
type FolderDraft = { id?: string; title: string };
type WorkspaceSnapshot = { project: Project; blocks: Block[]; items: Item[] };

const actDefaults = [
  { title: "1아크", body: "TBD" },
  { title: "2아크", body: "TBD" },
  { title: "3아크", body: "TBD" },
];
const workspaceCache = new Map<string, WorkspaceSnapshot>();

export function ProjectWorkspace({
  projectId,
  view,
  userName,
}: {
  projectId: string;
  view: WorkspaceView;
  userName: string;
}) {
  const router = useRouter();
  const cached = workspaceCache.get(projectId);
  const [project, setProject] = useState<Project | null>(() => cached?.project ?? null);
  const [blocks, setBlocks] = useState<Block[]>(() => cached?.blocks ?? []);
  const [items, setItems] = useState<Item[]>(() => cached?.items ?? []);
  const [loading, setLoading] = useState(() => !cached);
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [draggedDocument, setDraggedDocument] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);
  const [blockSaveStatus, setBlockSaveStatus] = useState<SaveStatus>("idle");
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft | null>(null);
  const [actDraft, setActDraft] = useState<Draft | null>(null);
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(
    () => cached?.items.find((item) => item.kind === "document")?.id ?? null,
  );
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [treeMenu, setTreeMenu] = useState<string | null>(null);
  const [treeAddOpen, setTreeAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const blockDraftRef = useRef<BlockDraft | null>(null);
  const blockSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockSaveInFlightRef = useRef(false);
  const blockSaveWaitersRef = useRef<Array<() => void>>([]);
  const blockSaveVersionRef = useRef(0);
  const blockPersistedVersionRef = useRef(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectId}/workspace`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const loadedItems: Item[] = data.items ?? [];
        const loadedDocuments = loadedItems.filter((item) => item.kind === "document");
        const loadedProject: Project | null = data.project ?? null;
        const loadedBlocks: Block[] = data.blocks ?? [];
        setProject(loadedProject);
        setBlocks(loadedBlocks);
        setItems(loadedItems);
        if (loadedProject) workspaceCache.set(projectId, { project: loadedProject, blocks: loadedBlocks, items: loadedItems });
        setOpenFolders(loadedItems.filter((item) => item.kind === "folder").map((item) => item.id));
        const requestedDocument =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("document") : null;
        setDocumentId(
          loadedDocuments.some((item) => item.id === requestedDocument)
            ? requestedDocument
            : loadedDocuments[0]?.id ?? null,
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (project) workspaceCache.set(projectId, { project, blocks, items });
  }, [projectId, project, blocks, items]);

  useEffect(() => {
    router.prefetch(`/project/${projectId}`);
    router.prefetch(`/project/${projectId}/characters`);
    router.prefetch(`/project/${projectId}/plot`);
    router.prefetch(`/project/${projectId}/documents`);
  }, [projectId, router]);

  useEffect(() => {
    function preservePendingDraft() {
      const draft = blockDraftRef.current;
      if (!draft || blockSaveVersionRef.current <= blockPersistedVersionRef.current) return;
      localStorage.setItem(blockDraftStorageKey(projectId, draft.id), JSON.stringify(draft));
    }
    window.addEventListener("beforeunload", preservePendingDraft);
    return () => {
      window.removeEventListener("beforeunload", preservePendingDraft);
      if (blockSaveTimerRef.current) clearTimeout(blockSaveTimerRef.current);
    };
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
          title: normalizeArcTitle(saved?.title, act) || fallback.title,
          body: normalizeArcBody(saved?.body) || fallback.body,
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
    openBlockDraft({ id: block.id, act: block.act, title: block.title, body: block.body, ...links });
  }

  function openBlockDraft(draft: BlockDraft) {
    if (blockSaveTimerRef.current) clearTimeout(blockSaveTimerRef.current);
    blockSaveVersionRef.current = 0;
    blockPersistedVersionRef.current = 0;
    const recovered = readStoredBlockDraft(projectId, draft.id);
    const next = recovered ? { ...draft, ...recovered, id: draft.id ?? recovered.id } : draft;
    blockDraftRef.current = next;
    setBlockDraft(next);
    setBlockSaveStatus(recovered ? "recovered" : draft.id ? "saved" : "idle");
  }

  function changeBlockDraft(draft: BlockDraft) {
    blockDraftRef.current = draft;
    setBlockDraft(draft);
    blockSaveVersionRef.current += 1;
    setBlockSaveStatus("saving");
    localStorage.setItem(blockDraftStorageKey(projectId, draft.id), JSON.stringify(draft));
    if (blockSaveTimerRef.current) clearTimeout(blockSaveTimerRef.current);
    blockSaveTimerRef.current = setTimeout(() => {
      void persistBlockDraft();
    }, 600);
  }

  async function persistBlockDraft() {
    if (blockSaveInFlightRef.current) {
      await new Promise<void>((resolve) => blockSaveWaitersRef.current.push(resolve));
      if (blockSaveVersionRef.current > blockPersistedVersionRef.current) return persistBlockDraft();
      return true;
    }
    const draft = blockDraftRef.current;
    const requestedVersion = blockSaveVersionRef.current;
    if (!draft || requestedVersion <= blockPersistedVersionRef.current) return true;
    if (!draft.id && !draft.title.trim() && !draft.body.trim()) {
      setBlockSaveStatus("idle");
      return true;
    }

    blockSaveInFlightRef.current = true;
    setBlockSaveStatus("saving");
    const endpoint = draft.id ? `/api/blocks/${draft.id}` : `/api/projects/${projectId}/blocks`;
    const meta = JSON.stringify({
      characterIds: draft.characterIds,
      documentIds: draft.documentIds,
    });
    const payload = {
      act: draft.act,
      title: draft.title.trim() || "새 블록",
      body: draft.body,
      meta,
    };
    let savedSuccessfully = false;

    try {
      const response = await fetch(endpoint, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("block save failed");

      if (draft.id) {
        setBlocks((current) =>
          current.map((block) =>
            block.id === draft.id
              ? { ...block, title: payload.title, body: payload.body, act: payload.act, meta }
              : block,
          ),
        );
      } else {
        const data = await response.json();
        if (!data.block) throw new Error("missing block");
        setBlocks((current) => [...current, data.block]);
        const latest = blockDraftRef.current;
        if (latest && !latest.id) {
          const identified = { ...latest, id: data.block.id };
          blockDraftRef.current = identified;
          setBlockDraft(identified);
          localStorage.removeItem(blockDraftStorageKey(projectId));
          localStorage.setItem(blockDraftStorageKey(projectId, data.block.id), JSON.stringify(identified));
        }
      }
      blockPersistedVersionRef.current = requestedVersion;
      const savedId = blockDraftRef.current?.id ?? draft.id;
      localStorage.removeItem(blockDraftStorageKey(projectId, savedId));
      localStorage.removeItem(blockDraftStorageKey(projectId));
      setBlockSaveStatus("saved");
      savedSuccessfully = true;
      return true;
    } catch {
      const latest = blockDraftRef.current;
      if (latest) localStorage.setItem(blockDraftStorageKey(projectId, latest.id), JSON.stringify(latest));
      setBlockSaveStatus("error");
      return false;
    } finally {
      blockSaveInFlightRef.current = false;
      blockSaveWaitersRef.current.splice(0).forEach((resolve) => resolve());
      if (savedSuccessfully && blockSaveVersionRef.current > blockPersistedVersionRef.current) {
        if (blockSaveTimerRef.current) clearTimeout(blockSaveTimerRef.current);
        blockSaveTimerRef.current = setTimeout(() => void persistBlockDraft(), 150);
      }
    }
  }

  async function closeBlockInspector() {
    if (blockSaveTimerRef.current) clearTimeout(blockSaveTimerRef.current);
    await persistBlockDraft();
    blockDraftRef.current = null;
    setBlockDraft(null);
    setBlockSaveStatus("idle");
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

  async function persistCharacter(draft: CharacterDraft) {
    const endpoint = draft.id ? `/api/items/${draft.id}` : `/api/projects/${projectId}/items`;
    const response = await fetch(endpoint, {
      method: draft.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "character",
        title: draft.title.trim() || "새 인물",
        body: draft.body,
        meta: draft.meta,
      }),
    });
    if (!response.ok) throw new Error("character save failed");
    const now = new Date().toISOString();
    if (draft.id) {
      const saved = { ...draft, title: draft.title.trim() || "새 인물", updatedAt: now };
      setItems((current) =>
        current.map((item) => (item.id === draft.id ? { ...item, ...saved } : item)),
      );
      return saved;
    } else {
      const data = await response.json();
      if (!data.item) throw new Error("missing character");
      setItems((current) => [...current, data.item]);
      return { id: data.item.id, title: data.item.title, body: data.item.body, meta: data.item.meta };
    }
  }

  function openCharacterDraft(draft: CharacterDraft) {
    setCharacterDraft(readStoredCharacterDraft(projectId, draft.id) ?? draft);
  }

  async function quickCreateItem(kind: "character" | "document", title: string) {
    const response = await fetch(`/api/projects/${projectId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        title: title.trim() || (kind === "character" ? "새 인물" : "새 문서"),
        body: "",
        meta: kind === "character"
          ? JSON.stringify(defaultCharacterMeta(Date.now()))
          : JSON.stringify({ folderId: null, sortOrder: Date.now() }),
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.item) return null;
    setItems((current) => [...current, data.item]);
    return data.item as Item;
  }

  async function reorderCharacters(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ordered = [...characters].sort(
      (left, right) => readCharacterMeta(left).sortOrder - readCharacterMeta(right).sortOrder,
    );
    const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
    const targetIndex = ordered.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, source);
    const updates = ordered.map((item, index) => {
      const meta = JSON.stringify({ ...readCharacterMeta(item), sortOrder: index });
      return { ...item, meta };
    });
    setItems((current) =>
      current.map((item) => updates.find((updated) => updated.id === item.id) ?? item),
    );
    await Promise.all(
      updates.map((item) =>
        fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ meta: item.meta }),
        }),
      ),
    );
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
      if (view !== "documents") router.push(`/project/${projectId}/documents?document=${data.item.id}`);
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
    if (view !== "documents") router.push(`/project/${projectId}/documents?document=${id}`);
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
        onDeleteItem={setPendingDelete}
        onDragDocument={setDraggedDocument}
        onDropDocument={dropDocument}
      />

      <section className="project-main">
        {view === "overview" && <Overview project={project} onSave={saveProject} />}
        {view === "characters" && (
          <Characters
            characters={characters}
            blocks={blocks}
            onNew={() => openCharacterDraft({
              title: "",
              body: "",
              meta: JSON.stringify(defaultCharacterMeta(Date.now())),
            })}
            onEdit={(item) => openCharacterDraft({
              id: item.id,
              title: item.title,
              body: item.body,
              meta: item.meta,
            })}
            onReorder={reorderCharacters}
          />
        )}
        {view === "plot" && (
          <Plot
            project={project}
            columns={columns}
            onNewBlock={(act) => openBlockDraft({
              act,
              title: "",
              body: "",
              characterIds: [],
              documentIds: [],
            })}
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
          actTitle={columns[blockDraft.act - 1]?.title ?? `${blockDraft.act}아크`}
          characters={characters}
          documents={documents}
          folders={folders}
          saveStatus={blockSaveStatus}
          setDraft={changeBlockDraft}
          onCreateCharacter={(title) => quickCreateItem("character", title)}
          onCreateDocument={(title) => quickCreateItem("document", title)}
          onClose={() => void closeBlockInspector()}
        />
      )}
      {characterDraft && (
        <CharacterInspector
          projectId={projectId}
          draft={characterDraft}
          blocks={blocks}
          setDraft={setCharacterDraft}
          onPersist={persistCharacter}
          onClose={() => setCharacterDraft(null)}
          onOpenBlock={(block) => {
            setCharacterDraft(null);
            inspectBlock(block);
          }}
          onAddBlock={(characterId) => {
            setCharacterDraft(null);
            openBlockDraft({
              act: 1,
              title: "",
              body: "",
              characterIds: [characterId],
              documentIds: [],
            });
          }}
          onDelete={characterDraft.id ? () => {
            const character = characters.find((item) => item.id === characterDraft.id);
            if (character) setPendingDelete(character);
            setCharacterDraft(null);
          } : undefined}
        />
      )}
      {actDraft && (
        <EditorModal title={`${actDraft.act}아크 설정`} draft={actDraft} setDraft={setActDraft} onSubmit={saveAct} onClose={() => setActDraft(null)} />
      )}
      {folderDraft && (
        <NameModal draft={folderDraft} setDraft={setFolderDraft} onSubmit={saveFolder} onClose={() => setFolderDraft(null)} />
      )}
      {pendingDelete && (
        <ConfirmDeleteModal
          item={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            void deleteItem(pendingDelete);
            setPendingDelete(null);
          }}
        />
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
      <Link className="back-home" href="/">⌂ 홈으로</Link>
      <div className="project-identity"><span>{props.project.genre}</span><strong>{props.project.title}</strong></div>
      <label className="sidebar-search">⌕<input placeholder="검색…" aria-label="작품 검색" /></label>
      <nav className="project-nav" aria-label="작품 메뉴">
        <Link className={props.view === "overview" ? "active" : ""} href={`/project/${props.projectId}`}>◇ <span>작품 개요</span></Link>
        <Link className={props.view === "characters" ? "active" : ""} href={`/project/${props.projectId}/characters`}>♙ <span>등장인물</span><b>{props.characters.length}</b></Link>
        <Link className={props.view === "plot" ? "active" : ""} href={`/project/${props.projectId}/plot`}>▦ <span>플롯</span><b>{props.blocks.length}</b></Link>
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
              <div className="tree-folder" key={folder.id} role="treeitem" aria-expanded={isOpen} aria-selected="false">
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
    <div className={`tree-row document-row ${props.active ? "active" : ""}`} role="treeitem" aria-selected={props.active} draggable onDragStart={() => props.onDrag(props.document.id)}>
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

function Characters({
  characters,
  blocks,
  onNew,
  onEdit,
  onReorder,
}: {
  characters: Item[];
  blocks: Block[];
  onNew: () => void;
  onEdit: (item: Item) => void;
  onReorder: (sourceId: string, targetId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<"manual" | "name" | "recent" | "links">("manual");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const backlinkCount = (characterId: string) =>
    blocks.filter((block) => readBlockLinks(block.meta).characterIds.includes(characterId)).length;
  const tags = Array.from(new Set(characters.flatMap((character) => readCharacterMeta(character).tags)))
    .sort((left, right) => left.localeCompare(right, "ko"));
  const visible = characters
    .filter((character) => {
      const meta = readCharacterMeta(character);
      const haystack = `${character.title} ${character.body} ${meta.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase()) && (tag === "all" || meta.tags.includes(tag));
    })
    .sort((left, right) => {
      const leftMeta = readCharacterMeta(left);
      const rightMeta = readCharacterMeta(right);
      if (leftMeta.pinned !== rightMeta.pinned) return leftMeta.pinned ? -1 : 1;
      if (sort === "name") return left.title.localeCompare(right.title, "ko");
      if (sort === "recent") return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
      if (sort === "links") return backlinkCount(right.id) - backlinkCount(left.id);
      return leftMeta.sortOrder - rightMeta.sortOrder;
    });

  return (
    <div className="page-wide">
      <PageHeader kicker="CHARACTERS" title={`등장인물 ${characters.length}`} description="욕망, 역할, 관계가 장면에서 바로 작동하게 정리." action={<button className="black-button" onClick={onNew}>＋ 새 인물</button>} />
      <div className="character-toolbar">
        <label className="character-search">
          <span>검색</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 설명, 태그 검색"
          />
        </label>
        <label>
          <span>태그</span>
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">전체 태그</option>
            {tags.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>정렬</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="manual">직접 정렬</option>
            <option value="name">이름순</option>
            <option value="recent">최근 수정순</option>
            <option value="links">연결 블록순</option>
          </select>
        </label>
      </div>
      <div className="table-head character-table-head">
        <span>이름</span><span>태그와 설명</span><span>연결</span>
      </div>
      <div className="character-list">
        {visible.map((character) => {
          const meta = readCharacterMeta(character);
          const links = backlinkCount(character.id);
          return (
            <article
              className="character-row"
              key={character.id}
              draggable={sort === "manual"}
              onDragStart={() => setDraggedId(character.id)}
              onDragOver={(event) => {
                if (sort === "manual") event.preventDefault();
              }}
              onDrop={() => {
                if (draggedId) void onReorder(draggedId, character.id);
                setDraggedId(null);
              }}
            >
              <button className="character-row-main" onClick={() => onEdit(character)}>
                <span className="character-name">
                  {meta.pinned && <span className="pin-label">고정</span>}
                  <strong>{character.title}</strong>
                </span>
                <span className="character-summary">
                  <span className="character-tags">
                    {meta.tags.map((value) => <span key={value}>{value}</span>)}
                    {!meta.tags.length && <span className="tag-empty">태그 없음</span>}
                  </span>
                  <span>{character.body || "이 인물이 원하는 것과 방해받는 이유를 적어."}</span>
                </span>
                <span className="character-links">{links}개 블록</span>
              </button>
            </article>
          );
        })}
        {!visible.length && (
          <div className="inline-empty">
            {characters.length ? "조건에 맞는 인물이 없음." : "인물이 아직 없음. 주인공부터 박자."}
          </div>
        )}
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
  folders: Item[];
  saveStatus: SaveStatus;
  setDraft: (draft: BlockDraft) => void;
  onCreateCharacter: (title: string) => Promise<Item | null>;
  onCreateDocument: (title: string) => Promise<Item | null>;
  onClose: () => void;
}) {
  return (
    <div className="inspector-backdrop" role="presentation" onMouseDown={props.onClose}>
      <aside className="block-inspector" role="dialog" aria-modal="true" aria-label="블록 상세" onMouseDown={(event) => event.stopPropagation()}>
        <div className="inspector-form">
          <div className="inspector-top">
            <button type="button" aria-label="블록 상세 닫기" onClick={props.onClose}>»</button>
            <span>블록 상세</span>
            <SaveStatusLabel status={props.saveStatus} />
          </div>
          <p className="inspector-breadcrumb">↳ {props.actTitle}</p>
          <input className="inspector-title" aria-label="블록 제목" autoFocus value={props.draft.title} onChange={(event) => props.setDraft({ ...props.draft, title: event.target.value })} placeholder="새 블록" />
          <InspectorSection title="내용">
            <textarea value={props.draft.body} onChange={(event) => props.setDraft({ ...props.draft, body: event.target.value })} placeholder="내용을 입력하세요…" />
          </InspectorSection>
          <InspectorSection title="등장인물">
            <MultiLinkPicker
              kind="character"
              items={props.characters}
              selectedIds={props.draft.characterIds}
              onChange={(characterIds) => props.setDraft({ ...props.draft, characterIds })}
              onCreate={async (title) => {
                const item = await props.onCreateCharacter(title);
                if (item) props.setDraft({
                  ...props.draft,
                  characterIds: [...props.draft.characterIds, item.id],
                });
              }}
            />
          </InspectorSection>
          <InspectorSection title="문서">
            <MultiLinkPicker
              kind="document"
              items={props.documents}
              folders={props.folders}
              selectedIds={props.draft.documentIds}
              onChange={(documentIds) => props.setDraft({ ...props.draft, documentIds })}
              onCreate={async (title) => {
                const item = await props.onCreateDocument(title);
                if (item) props.setDraft({
                  ...props.draft,
                  documentIds: [...props.draft.documentIds, item.id],
                });
              }}
            />
          </InspectorSection>
          <div className="inspector-autosave-note">변경사항은 자동으로 저장됨.</div>
        </div>
      </aside>
    </div>
  );
}

function MultiLinkPicker({
  kind,
  items,
  folders = [],
  selectedIds,
  onChange,
  onCreate,
}: {
  kind: "character" | "document";
  items: Item[];
  folders?: Item[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const selected = selectedIds.map((id) => items.find((item) => item.id === id)).filter((item): item is Item => Boolean(item));
  const filtered = items.filter((item) => {
    const label = pickerItemLabel(item, kind, folders);
    return `${label} ${item.body}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && filtered.length) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp" && filtered.length) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      toggle(filtered[activeIndex].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setActiveIndex(0);
    }
  }

  async function createFromQuery() {
    setCreating(true);
    await onCreate(query.trim());
    setQuery("");
    setActiveIndex(0);
    setCreating(false);
  }

  return (
    <div className="smart-picker">
      <div className="picker-chips" aria-label={`선택된 ${kind === "character" ? "등장인물" : "문서"}`}>
        {selected.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => toggle(item.id)}
            aria-label={`${pickerItemLabel(item, kind, folders)} 제거`}
          >
            <span>{pickerItemLabel(item, kind, folders)}</span><b aria-hidden="true">×</b>
          </button>
        ))}
        {!selected.length && <span className="picker-empty">선택된 항목 없음</span>}
      </div>
      <input
        role="combobox"
        aria-expanded="true"
        aria-controls={`${kind}-picker-list`}
        aria-activedescendant={filtered[activeIndex] ? `${kind}-option-${filtered[activeIndex].id}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={kind === "character" ? "인물 검색…" : "문서 검색…"}
      />
      <div className="picker-results" id={`${kind}-picker-list`} role="listbox">
        {filtered.map((item, index) => (
          <button
            type="button"
            role="option"
            aria-selected={selectedIds.includes(item.id)}
            id={`${kind}-option-${item.id}`}
            className={index === activeIndex ? "active" : ""}
            key={item.id}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => toggle(item.id)}
          >
            <strong>{pickerItemLabel(item, kind, folders)}</strong>
            {kind === "character" && <span>{item.body || "설명 없음"}</span>}
            <b>{selectedIds.includes(item.id) ? "선택됨" : "추가"}</b>
          </button>
        ))}
        {!filtered.length && <span className="picker-empty">검색 결과 없음</span>}
      </div>
      <button className="picker-create" type="button" onClick={() => void createFromQuery()} disabled={creating}>
        ＋ {query.trim() || `새 ${kind === "character" ? "인물" : "문서"}`} 만들기
      </button>
    </div>
  );
}

function CharacterInspector({
  projectId,
  draft,
  blocks,
  setDraft,
  onPersist,
  onClose,
  onOpenBlock,
  onAddBlock,
  onDelete,
}: {
  projectId: string;
  draft: CharacterDraft;
  blocks: Block[];
  setDraft: (draft: CharacterDraft | null) => void;
  onPersist: (draft: CharacterDraft) => Promise<CharacterDraft>;
  onClose: () => void;
  onOpenBlock: (block: Block) => void;
  onAddBlock: (characterId: string) => void;
  onDelete?: () => void;
}) {
  const [status, setStatus] = useState<SaveStatus>(() => {
    if (typeof window !== "undefined" && localStorage.getItem(characterDraftStorageKey(projectId, draft.id))) {
      return "recovered";
    }
    return draft.id ? "saved" : "idle";
  });
  const [tagInput, setTagInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const draftRef = useRef(draft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(0);
  const persistedVersionRef = useRef(0);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const meta = readCharacterDraftMeta(draft);
  const backlinks = draft.id
    ? blocks.filter((block) => readBlockLinks(block.meta).characterIds.includes(draft.id as string))
    : [];

  useEffect(() => {
    function preservePendingDraft() {
      if (versionRef.current <= persistedVersionRef.current) return;
      localStorage.setItem(characterDraftStorageKey(projectId, draftRef.current.id), JSON.stringify(draftRef.current));
    }
    window.addEventListener("beforeunload", preservePendingDraft);
    return () => {
      window.removeEventListener("beforeunload", preservePendingDraft);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // The inspector mounts once per selected character; recovery should not rerun while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(next: CharacterDraft) {
    draftRef.current = next;
    setDraft(next);
    versionRef.current += 1;
    setStatus("saving");
    localStorage.setItem(characterDraftStorageKey(projectId, next.id), JSON.stringify(next));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(), 600);
  }

  async function persist(): Promise<boolean> {
    if (savePromiseRef.current) {
      await savePromiseRef.current;
      if (versionRef.current > persistedVersionRef.current) return persist();
      return true;
    }
    const snapshot = draftRef.current;
    const requestedVersion = versionRef.current;
    if (requestedVersion <= persistedVersionRef.current) return true;
    if (!snapshot.id && !snapshot.title.trim() && !snapshot.body.trim()) {
      setStatus("idle");
      return true;
    }

    setStatus("saving");
    const run = (async () => {
      try {
        const saved = await onPersist(snapshot);
        const latest = draftRef.current;
        if (!latest.id && saved.id) {
          const identified = { ...latest, id: saved.id };
          draftRef.current = identified;
          setDraft(identified);
          localStorage.removeItem(characterDraftStorageKey(projectId));
        }
        persistedVersionRef.current = requestedVersion;
        localStorage.removeItem(characterDraftStorageKey(projectId, draftRef.current.id));
        setStatus("saved");
        return true;
      } catch {
        localStorage.setItem(
          characterDraftStorageKey(projectId, draftRef.current.id),
          JSON.stringify(draftRef.current),
        );
        setStatus("error");
        return false;
      }
    })();
    savePromiseRef.current = run;
    const result = await run;
    savePromiseRef.current = null;
    if (result && versionRef.current > persistedVersionRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void persist(), 150);
    }
    return result;
  }

  async function close() {
    if (timerRef.current) clearTimeout(timerRef.current);
    await persist();
    onClose();
  }

  function updateMeta(update: Partial<CharacterMeta>) {
    change({ ...draft, meta: JSON.stringify({ ...meta, ...update }) });
  }

  function addTag() {
    const value = tagInput.trim().replace(/^#/, "");
    if (!value || meta.tags.includes(value)) {
      setTagInput("");
      return;
    }
    updateMeta({ tags: [...meta.tags, value] });
    setTagInput("");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
  }

  async function handleAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarError("");
    try {
      const avatar = await resizeAvatar(file);
      updateMeta({ avatar });
    } catch {
      setAvatarError("이미지를 처리하지 못했음. JPG·PNG·WEBP 파일을 써 줘.");
    }
  }

  return (
    <div className="inspector-backdrop character-backdrop" role="presentation" onMouseDown={() => void close()}>
      <aside className="character-inspector" role="dialog" aria-modal="true" aria-label="등장인물 상세" onMouseDown={(event) => event.stopPropagation()}>
        <div className="character-inspector-top">
          <button type="button" aria-label="등장인물 상세 닫기" onClick={() => void close()}>»</button>
          <span>{backlinks.length}개의 연결 블록</span>
          <SaveStatusLabel status={status} />
          <div className="character-more-wrap">
            <button type="button" aria-label="등장인물 관리" onClick={() => setMenuOpen((current) => !current)}>···</button>
            {menuOpen && (
              <div className="character-more-menu">
                <button type="button" onClick={() => updateMeta({ pinned: !meta.pinned })}>
                  {meta.pinned ? "고정 해제" : "주연으로 고정"}
                </button>
                {onDelete && <button type="button" className="danger" onClick={onDelete}>인물 삭제</button>}
              </div>
            )}
          </div>
        </div>

        <div className="character-detail-scroll">
          <div className="character-profile-head">
            <label className="character-avatar">
              {meta.avatar ? (
                // User-provided data URLs are already resized before storage and do not use an external loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={meta.avatar} alt="" />
              ) : <span>이미지 추가</span>}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void handleAvatar(event.target.files?.[0])}
              />
            </label>
            <div className="character-title-wrap">
              {meta.pinned && <span className="pinned-character">주연 고정</span>}
              <input
                aria-label="인물 이름"
                className="character-detail-title"
                autoFocus
                value={draft.title}
                onChange={(event) => change({ ...draft, title: event.target.value })}
                placeholder="새 인물"
              />
            </div>
          </div>
          {avatarError && <p className="field-error" role="alert">{avatarError}</p>}

          <section className="character-detail-section">
            <div className="character-section-label"><strong>태그</strong><span>역할과 분류</span></div>
            <div className="tag-editor">
              <div className="tag-chips">
                {meta.tags.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => updateMeta({ tags: meta.tags.filter((tag) => tag !== value) })}
                    aria-label={`${value} 태그 제거`}
                  >
                    {value} ×
                  </button>
                ))}
                {!meta.tags.length && <span>비어 있음</span>}
              </div>
              <div className="tag-input-row">
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={addTag}
                  placeholder="태그 입력 후 Enter"
                />
                <button type="button" onClick={addTag}>추가</button>
              </div>
            </div>
          </section>

          <section className="character-detail-section">
            <div className="character-section-label"><strong>설명</strong><span>욕망, 역할, 갈등</span></div>
            <textarea
              value={draft.body}
              onChange={(event) => change({ ...draft, body: event.target.value })}
              placeholder="이 인물이 원하는 것과 방해받는 이유를 적어."
            />
          </section>

          <section className="character-detail-section custom-fields-section">
            <div className="character-section-label"><strong>정보 블록</strong><span>필요한 항목을 직접 추가</span></div>
            <div className="custom-fields">
              {meta.fields.map((field) => (
                <div className="custom-field" key={field.id}>
                  <input
                    aria-label="정보 블록 이름"
                    value={field.label}
                    onChange={(event) => updateMeta({
                      fields: meta.fields.map((value) =>
                        value.id === field.id ? { ...value, label: event.target.value } : value,
                      ),
                    })}
                    placeholder="항목 이름"
                  />
                  <textarea
                    aria-label={`${field.label || "사용자 항목"} 내용`}
                    value={field.value}
                    onChange={(event) => updateMeta({
                      fields: meta.fields.map((value) =>
                        value.id === field.id ? { ...value, value: event.target.value } : value,
                      ),
                    })}
                    placeholder="내용을 입력"
                  />
                  <button
                    type="button"
                    aria-label={`${field.label || "사용자 항목"} 삭제`}
                    onClick={() => updateMeta({ fields: meta.fields.filter((value) => value.id !== field.id) })}
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                className="add-custom-field"
                type="button"
                onClick={() => updateMeta({
                  fields: [...meta.fields, { id: crypto.randomUUID(), label: "새 항목", value: "" }],
                })}
              >
                ＋ 정보 블록 추가
              </button>
            </div>
          </section>

          <section className="character-detail-section backlinks-section">
            <div className="character-section-label"><strong>연결 블록</strong><span>이 인물이 실제로 등장하는 장면</span></div>
            <div className="backlink-list">
              {backlinks.map((block) => (
                <button type="button" key={block.id} onClick={() => onOpenBlock(block)}>
                  <span>{block.act}아크</span><strong>{block.title}</strong><p>{block.body || "내용 없음"}</p>
                </button>
              ))}
              {!backlinks.length && <span className="picker-empty">연결된 블록이 아직 없음.</span>}
            </div>
            {draft.id && (
              <button className="add-linked-block" type="button" onClick={() => onAddBlock(draft.id as string)}>
                ＋ 이 인물이 연결된 블록 추가
              </button>
            )}
          </section>
        </div>
        <div className="inspector-autosave-note">변경사항은 자동으로 저장됨.</div>
      </aside>
    </div>
  );
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
  const label = {
    idle: "입력 대기",
    saving: "저장 중…",
    saved: "저장됨",
    error: "저장 실패 · 다시 입력하면 재시도",
    recovered: "임시 내용을 복구함",
  }[status];
  return <span className={`save-status ${status}`} aria-live="polite">{label}</span>;
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
  onDelete?: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="modal-card" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2>{props.title}</h2><button type="button" className="icon-button" onClick={props.onClose}>×</button></div>
        <label>제목<input autoFocus value={props.draft.title} onChange={(event) => props.setDraft({ ...props.draft, title: event.target.value })} /></label>
        <label>설명<textarea value={props.draft.body} onChange={(event) => props.setDraft({ ...props.draft, body: event.target.value })} /></label>
        <div className="modal-actions">
          {props.onDelete ? <button className="delete-button" type="button" onClick={props.onDelete}>삭제</button> : <span />}
          <button className="black-button" type="submit">저장</button>
        </div>
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

function ConfirmDeleteModal({ item, onClose, onConfirm }: { item: Item; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2 id="delete-title">{item.kind === "folder" ? "폴더 삭제" : item.kind === "character" ? "인물 삭제" : "문서 삭제"}</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <p><strong>{item.title}</strong>을(를) 삭제할까? {item.kind === "folder" ? "안의 문서는 최상위로 이동됨." : "이 작업은 되돌릴 수 없음."}</p>
        <div className="modal-actions">
          <button className="outline-cancel" type="button" onClick={onClose}>취소</button>
          <button className="confirm-delete" type="button" onClick={onConfirm}>삭제하기</button>
        </div>
      </section>
    </div>
  );
}

function blockDraftStorageKey(projectId: string, blockId?: string) {
  return `storyyard:block-draft:${projectId}:${blockId ?? "new"}`;
}

function characterDraftStorageKey(projectId: string, characterId?: string) {
  return `storyyard:character-draft:${projectId}:${characterId ?? "new"}`;
}

function readStoredBlockDraft(projectId: string, blockId?: string): BlockDraft | null {
  try {
    const raw = localStorage.getItem(blockDraftStorageKey(projectId, blockId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BlockDraft>;
    if (typeof value.act !== "number" || typeof value.title !== "string" || typeof value.body !== "string") return null;
    return {
      id: typeof value.id === "string" ? value.id : blockId,
      act: value.act,
      title: value.title,
      body: value.body,
      characterIds: Array.isArray(value.characterIds)
        ? value.characterIds.filter((id): id is string => typeof id === "string")
        : [],
      documentIds: Array.isArray(value.documentIds)
        ? value.documentIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function readStoredCharacterDraft(projectId: string, characterId?: string): CharacterDraft | null {
  try {
    const raw = localStorage.getItem(characterDraftStorageKey(projectId, characterId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CharacterDraft>;
    if (typeof value.title !== "string" || typeof value.body !== "string" || typeof value.meta !== "string") return null;
    return {
      id: typeof value.id === "string" ? value.id : characterId,
      title: value.title,
      body: value.body,
      meta: value.meta,
    };
  } catch {
    return null;
  }
}

function defaultCharacterMeta(sortOrder: number): CharacterMeta {
  return { tags: [], pinned: false, avatar: "", fields: [], sortOrder };
}

function readCharacterMeta(item: Pick<Item, "meta" | "updatedAt">): CharacterMeta {
  return parseCharacterMeta(item.meta, item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now());
}

function readCharacterDraftMeta(draft: CharacterDraft): CharacterMeta {
  return parseCharacterMeta(draft.meta, Date.now());
}

function parseCharacterMeta(meta: string, fallbackSortOrder: number): CharacterMeta {
  const value = readObject(meta);
  const fields = Array.isArray(value.fields)
    ? value.fields.flatMap((field) => {
        if (!field || typeof field !== "object") return [];
        const candidate = field as Record<string, unknown>;
        if (typeof candidate.id !== "string") return [];
        return [{
          id: candidate.id,
          label: typeof candidate.label === "string" ? candidate.label : "",
          value: typeof candidate.value === "string" ? candidate.value : "",
        }];
      })
    : [];
  return {
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
      : [],
    pinned: value.pinned === true,
    avatar: typeof value.avatar === "string" ? value.avatar : "",
    fields,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : fallbackSortOrder,
  };
}

function pickerItemLabel(item: Item, kind: "character" | "document", folders: Item[]) {
  if (kind === "character") return item.title;
  const folder = folders.find((value) => value.id === documentFolder(item));
  return folder ? `${folder.title} / ${item.title}` : item.title;
}

async function resizeAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = reject;
      candidate.src = objectUrl;
    });
    const max = 480;
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readAct(meta: string) {
  return Number(readObject(meta).act ?? 0);
}

function normalizeArcTitle(title: string | undefined, act: number) {
  const value = title?.trim();
  if (!value || value === "TBD") return `${act}아크`;
  if (/^[123]\s*막\s*·\s*(각성|진실과 갈등|결전과 선택)$/.test(value)) return `${act}아크`;
  return value.replace(/^(\d+)\s*막\b/, "$1아크").replace(/^(\d+)막/, "$1아크");
}

function normalizeArcBody(body: string | undefined) {
  const value = body?.trim();
  if (!value) return "TBD";
  if ([
    "세계가 흔들리고, 주인공이 이전으로 돌아갈 수 없게 된다.",
    "목표를 향할수록 대가와 적의 정체가 선명해진다.",
    "가장 큰 대가 앞에서 주인공이 마지막 선택을 내린다.",
  ].includes(value)) return "TBD";
  return value;
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
