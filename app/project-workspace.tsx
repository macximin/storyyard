"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CoverPicker } from "./cover-picker";
import { CoverKey, resolveCoverSrc } from "./cover-options";
import { startNavigationProgress } from "./navigation-progress";
import { broadcastPublicationUpdate } from "./publication-events";
import { ArrowsClockwise, DotsThree, FileText, GlobeHemisphereWest, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "./workspace-data";

export type WorkspaceView = "overview" | "characters" | "plot" | "documents" | "manuscript" | "publish";
type Project = { id: string; title: string; logline: string; genre: string; coverKey: CoverKey; favorite: number; contentRevision: string; updatedAt: string };
type Block = { id: string; act: number; kind: string; title: string; body: string; meta: string; sortOrder: number };
type Item = { id: string; kind: string; title: string; body: string; meta: string; updatedAt?: string };
type Draft = { id?: string; title: string; body: string; act?: number };
type BlockDraft = Draft & { act: number; plotId: string; characterIds: string[]; documentIds: string[] };
type CharacterDraft = { id?: string; title: string; body: string; meta: string };
type CharacterField = { id: string; label: string; value: string };
type PlotDraft = { id: string; title: string; body: string; meta: string };
type PlotMeta = { isDefault: boolean; sortOrder: number };
export type FoundryPackageSummary = {
  workSlug: string;
  title: string;
  sourceCommit: string;
  bundleSha256: string;
  currentEpisode: string;
  currentBArc: string;
};
type CharacterMeta = {
  tags: string[];
  pinned: boolean;
  avatar: string;
  fields: CharacterField[];
  sortOrder: number;
};
type SaveStatus = "idle" | "saving" | "saved" | "error" | "recovered";
type FolderDraft = { id?: string; title: string };
const workspaceCache = new Map<string, WorkspaceSnapshot>();

export function ProjectWorkspace({
  projectId,
  view,
  userName,
  initialSnapshot,
  initialFoundryPackages,
}: {
  projectId: string;
  view: WorkspaceView;
  userName: string;
  initialSnapshot?: WorkspaceSnapshot | null;
  initialFoundryPackages?: FoundryPackageSummary[];
}) {
  const router = useRouter();
  const cached = workspaceCache.get(projectId) ?? initialSnapshot ?? undefined;
  const [project, setProject] = useState<Project | null>(() => cached?.project ?? null);
  const [blocks, setBlocks] = useState<Block[]>(() => cached?.blocks ?? []);
  const [items, setItems] = useState<Item[]>(() => cached?.items ?? []);
  const [loading, setLoading] = useState(
    () => !cached && initialSnapshot === undefined,
  );
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [draggedPlot, setDraggedPlot] = useState<string | null>(null);
  const [draggedDocument, setDraggedDocument] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);
  const [blockSaveStatus, setBlockSaveStatus] = useState<SaveStatus>("idle");
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft | null>(null);
  const [plotDraft, setPlotDraft] = useState<PlotDraft | null>(null);
  const [plotMenuOpen, setPlotMenuOpen] = useState(false);
  const [activePlotId, setActivePlotId] = useState<string | null>(null);
  const [actDraft, setActDraft] = useState<Draft | null>(null);
  const [creatingAct, setCreatingAct] = useState(false);
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(
    () => cached?.items.find((item) => item.kind === "document")?.id ?? null,
  );
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [treeMenu, setTreeMenu] = useState<string | null>(null);
  const [treeAddOpen, setTreeAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [foundryPackages, setFoundryPackages] = useState<FoundryPackageSummary[]>(
    () => initialFoundryPackages ?? [],
  );
  const [foundrySyncing, setFoundrySyncing] = useState(false);
  const [foundrySyncMessage, setFoundrySyncMessage] = useState("");
  const blockDraftRef = useRef<BlockDraft | null>(null);
  const blockSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockSaveInFlightRef = useRef(false);
  const blockSaveWaitersRef = useRef<Array<() => void>>([]);
  const blockSaveVersionRef = useRef(0);
  const blockPersistedVersionRef = useRef(0);
  const creatingDefaultPlotRef = useRef(false);

  useEffect(() => {
    let active = true;
    function applySnapshot(data: WorkspaceSnapshot | null) {
      if (!active) return;
      if (!data) {
        setProject(null);
        setBlocks([]);
        setItems([]);
        setLoading(false);
        return;
      }
        const loadedItems: Item[] = data.items;
        const loadedDocuments = loadedItems.filter((item) => item.kind === "document");
        const loadedPlots = loadedItems
          .filter((item) => item.kind === "plot")
          .sort((left, right) => readPlotMeta(left).sortOrder - readPlotMeta(right).sortOrder);
        const loadedProject: Project = data.project;
        const loadedBlocks: Block[] = data.blocks;
        setProject(loadedProject);
        setBlocks(loadedBlocks);
        setItems(loadedItems);
        workspaceCache.set(projectId, data);
        setOpenFolders(loadedItems.filter((item) => item.kind === "folder").map((item) => item.id));
        const requestedDocument =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("document") : null;
        const requestedPlot =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("plot") : null;
        setDocumentId(
          loadedDocuments.some((item) => item.id === requestedDocument)
            ? requestedDocument
            : loadedDocuments[0]?.id ?? null,
        );
        setActivePlotId(
          loadedPlots.some((item) => item.id === requestedPlot)
            ? requestedPlot
            : loadedPlots.find((item) => readPlotMeta(item).isDefault)?.id ?? loadedPlots[0]?.id ?? null,
        );
        setLoading(false);
    }
    if (initialSnapshot !== undefined) {
      applySnapshot(initialSnapshot);
      return () => { active = false; };
    }
    fetch(`/api/projects/${projectId}/workspace`)
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => applySnapshot(data as WorkspaceSnapshot | null))
      .catch(() => applySnapshot(null));
    return () => {
      active = false;
    };
  }, [initialSnapshot, projectId]);

  useEffect(() => {
    if (project) workspaceCache.set(projectId, { project, blocks, items });
  }, [projectId, project, blocks, items]);

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
  const plots = items
    .filter((item) => item.kind === "plot")
    .sort((left, right) => readPlotMeta(left).sortOrder - readPlotMeta(right).sortOrder);
  const defaultPlot = plots.find((item) => readPlotMeta(item).isDefault) ?? plots[0] ?? null;
  const activePlot = plots.find((item) => item.id === activePlotId) ?? defaultPlot;
  const selectedDocument = documents.find((item) => item.id === documentId) ?? null;
  const columns = useMemo(
    () => {
      if (!activePlot) return [];
      const isDefaultPlot = readPlotMeta(activePlot).isDefault;
      const plotActs = actItems.filter((item) =>
        belongsToPlot(item.meta, activePlot.id, isDefaultPlot),
      );
      const plotBlocks = blocks.filter((block) =>
        belongsToPlot(block.meta, activePlot.id, isDefaultPlot),
      );
      const maxAct = Math.max(
        3,
        ...plotActs.map((item) => readAct(item.meta)),
        ...plotBlocks.map((block) => block.act),
      );
      return Array.from({ length: maxAct }, (_, index) => {
        const act = index + 1;
        const saved = plotActs.find((item) => readAct(item.meta) === act);
        return {
          act,
          title: normalizeArcTitle(saved?.title, act),
          body: normalizeArcBody(saved?.body),
          meta: saved?.meta ?? "{}",
          blocks: plotBlocks
            .filter((block) => block.act === act)
            .sort((left, right) => left.sortOrder - right.sortOrder),
        };
      });
    },
    [actItems, activePlot, blocks],
  );

  useEffect(() => {
    if (loading || !project || plots.length || creatingDefaultPlotRef.current) return;
    creatingDefaultPlotRef.current = true;
    void fetch(`/api/projects/${projectId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "plot",
        title: `${project.title} — 아크 로드맵`,
        body: project.logline,
        meta: JSON.stringify({ isDefault: true, sortOrder: 0 }),
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.item) return;
        setItems((current) =>
          current.some((item) => item.id === data.item.id) ? current : [...current, data.item],
        );
        setActivePlotId(data.item.id);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("plot", data.item.id);
          window.history.replaceState(window.history.state, "", url);
        }
      })
      .finally(() => {
        creatingDefaultPlotRef.current = false;
      });
  }, [loading, plots.length, project, projectId]);

  useEffect(() => {
    if (view !== "plot" || !project) return;
    if (initialFoundryPackages !== undefined) {
      return;
    }
    let active = true;
    fetch(`/api/projects/${projectId}/foundry-sync`)
      .then(async (response) => response.ok ? response.json() : { packages: [] })
      .then((data) => {
        if (active) setFoundryPackages(Array.isArray(data.packages) ? data.packages : []);
      })
      .catch(() => {
        if (active) setFoundryPackages([]);
      });
    return () => {
      active = false;
    };
  }, [initialFoundryPackages, project, projectId, view]);

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
        coverKey: form.get("coverKey"),
      }),
    });
    const data = await response.json();
    if (data.project) setProject(data.project);
    if (data.publication?.status === "published") {
      broadcastPublicationUpdate({
        projectId,
        slug: data.publication.slug,
        revision: data.publication.revision,
      });
    }
  }

  function inspectBlock(block: Block) {
    const links = readBlockLinks(block.meta);
    openBlockDraft({
      id: block.id,
      act: block.act,
      plotId: links.plotId ?? activePlot?.id ?? "",
      title: block.title,
      body: block.body,
      characterIds: links.characterIds,
      documentIds: links.documentIds,
    });
  }

  function openBlockDraft(draft: BlockDraft) {
    if (blockSaveTimerRef.current) clearTimeout(blockSaveTimerRef.current);
    blockSaveVersionRef.current = 0;
    blockPersistedVersionRef.current = 0;
    const recovered = readStoredBlockDraft(projectId, draft.id);
    const next = recovered
      ? { ...draft, ...recovered, id: draft.id ?? recovered.id, plotId: recovered.plotId || draft.plotId }
      : draft;
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
    const existingBlock = draft.id ? blocks.find((block) => block.id === draft.id) : null;
    const meta = JSON.stringify({
      ...(existingBlock ? readObject(existingBlock.meta) : {}),
      plotId: draft.plotId,
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

  async function createPlot(isDefault = false) {
    if (!project) return null;
    const response = await fetch(`/api/projects/${projectId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "plot",
        title: isDefault ? `${project.title} — 아크 로드맵` : "새 플롯",
        body: isDefault ? project.logline : "TBD",
        meta: JSON.stringify({ isDefault, sortOrder: isDefault ? 0 : Date.now() }),
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.item) return null;
    setItems((current) =>
      current.some((item) => item.id === data.item.id) ? current : [...current, data.item],
    );
    selectPlot(data.item.id);
    return data.item as Item;
  }

  function selectPlot(id: string) {
    setActivePlotId(id);
    setPlotMenuOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("plot", id);
      window.history.replaceState(window.history.state, "", url);
    }
  }

  async function savePlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plotDraft || !plotDraft.title.trim()) return;
    const next = { ...plotDraft, title: plotDraft.title.trim() };
    const response = await fetch(`/api/items/${next.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next.title, body: next.body, meta: next.meta }),
    });
    if (!response.ok) return;
    setItems((current) =>
      current.map((item) =>
        item.id === next.id
          ? { ...item, title: next.title, body: next.body, meta: next.meta, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
    setPlotDraft(null);
  }

  async function reorderPlots(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ordered = [...plots];
    const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
    const targetIndex = ordered.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, source);
    const updates = ordered.map((item, index) => ({
      ...item,
      meta: JSON.stringify({ ...readPlotMeta(item), sortOrder: index }),
    }));
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
    if (!actDraft?.act || !activePlot) return;
    const existing = actItems.find(
      (item) =>
        readAct(item.meta) === actDraft.act &&
        belongsToPlot(item.meta, activePlot.id, readPlotMeta(activePlot).isDefault),
    );
    const endpoint = existing ? `/api/items/${existing.id}` : `/api/projects/${projectId}/items`;
    const meta = JSON.stringify({
      ...(existing ? readObject(existing.meta) : {}),
      act: actDraft.act,
      plotId: activePlot.id,
    });
    const response = await fetch(endpoint, {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "act",
        title: actDraft.title,
        body: actDraft.body,
        meta,
      }),
    });
    if (existing) {
      setItems((current) =>
        current.map((item) =>
          item.id === existing.id ? { ...item, title: actDraft.title, body: actDraft.body, meta } : item,
        ),
      );
    } else {
      const data = await response.json();
      if (data.item) setItems((current) => [...current, data.item]);
    }
    setActDraft(null);
  }

  async function syncFoundryProjection() {
    if (!project || foundrySyncing) return;
    const activeSync = activePlot ? readFoundrySyncInfo(activePlot.meta) : null;
    const canonPackage = foundryPackages.find((item) => item.workSlug === activeSync?.workSlug)
      ?? foundryPackages.find((item) => item.title.trim() === project.title.trim());
    if (!canonPackage) {
      setFoundrySyncMessage("작품 제목과 일치하는 Foundry 정본이 없음.");
      return;
    }
    setFoundrySyncing(true);
    setFoundrySyncMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/foundry-sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workSlug: canonPackage.workSlug,
          repairLegacySnapshot: true,
          preserveConflicts: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Foundry 동기화 실패");
      const workspaceResponse = await fetch(`/api/projects/${projectId}/workspace`);
      if (!workspaceResponse.ok) throw new Error("동기화 결과 새로고침 실패");
      const snapshot = await workspaceResponse.json() as WorkspaceSnapshot;
      setProject(snapshot.project);
      setBlocks(snapshot.blocks);
      setItems(snapshot.items);
      workspaceCache.set(projectId, snapshot);
      setActivePlotId(data.report.plotId);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("plot", data.report.plotId);
        window.history.replaceState(window.history.state, "", url);
      }
      const changed = data.report.created + data.report.updated;
      const workspaceChanged = Object.entries(data.report.workspace ?? {})
        .filter(([, value]) => typeof value === "number")
        .reduce((sum, [, value]) => sum + Number(value), 0);
      setFoundrySyncMessage(
        data.report.conflicts.length
          ? `Storyyard 수정본 ${data.report.conflicts.length}개 보존 · 나머지 정본 반영`
          : `작업실·커뮤니티 ${workspaceChanged}개, 플롯 ${changed}개 반영 · 같은 정본으로 잠금`,
      );
      if (data.report.communitySlug) {
        broadcastPublicationUpdate({
          projectId,
          slug: data.report.communitySlug,
          revision: data.revision,
        });
      }
    } catch (error) {
      setFoundrySyncMessage(error instanceof Error ? error.message : "Foundry 동기화 실패");
    } finally {
      setFoundrySyncing(false);
    }
  }

  async function createAct() {
    if (!activePlot || creatingAct) return;
    const act = Math.max(0, ...columns.map((column) => column.act)) + 1;
    const meta = JSON.stringify({ act, plotId: activePlot.id });
    setCreatingAct(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "act",
          title: `${act}아크`,
          body: "TBD",
          meta,
        }),
      });
      const data = await response.json();
      if (data.item) setItems((current) => [...current, data.item]);
    } finally {
      setCreatingAct(false);
    }
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
      if (view !== "documents") {
        startNavigationProgress();
        router.push(`/project/${projectId}/documents?document=${data.item.id}`);
      }
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
    if (item.kind === "plot") {
      if (plots.length <= 1) return;
      const itemMeta = readPlotMeta(item);
      const doomedBlocks = blocks.filter((block) =>
        belongsToPlot(block.meta, item.id, itemMeta.isDefault),
      );
      const doomedActs = actItems.filter((act) =>
        belongsToPlot(act.meta, item.id, itemMeta.isDefault),
      );
      await Promise.all([
        ...doomedBlocks.map((block) => fetch(`/api/blocks/${block.id}`, { method: "DELETE" })),
        ...doomedActs.map((act) => fetch(`/api/items/${act.id}`, { method: "DELETE" })),
      ]);
      await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      const remaining = plots.filter((plot) => plot.id !== item.id);
      let nextItems = items.filter(
        (value) => value.id !== item.id && !doomedActs.some((act) => act.id === value.id),
      );
      if (itemMeta.isDefault && remaining[0]) {
        const replacement = {
          ...remaining[0],
          meta: JSON.stringify({ ...readPlotMeta(remaining[0]), isDefault: true }),
        };
        await fetch(`/api/items/${replacement.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ meta: replacement.meta }),
        });
        nextItems = nextItems.map((value) => (value.id === replacement.id ? replacement : value));
      }
      setBlocks((current) => current.filter((block) => !doomedBlocks.some((doomed) => doomed.id === block.id)));
      setItems(nextItems);
      selectPlot(remaining[0]?.id ?? "");
      setPlotMenuOpen(false);
      return;
    }
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
    if (view !== "documents") {
      startNavigationProgress();
      router.push(`/project/${projectId}/documents?document=${id}`);
    }
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
        plots={plots}
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
        {view === "plot" && activePlot && (
          <Plot
            key={activePlot.id}
            plots={plots}
            activePlot={activePlot}
            columns={columns}
            creatingAct={creatingAct}
            menuOpen={plotMenuOpen}
            draggedPlot={draggedPlot}
            onSelectPlot={selectPlot}
            onNewPlot={() => void createPlot(false)}
            onEditPlot={() => {
              setPlotDraft({
                id: activePlot.id,
                title: activePlot.title,
                body: activePlot.body,
                meta: activePlot.meta,
              });
              setPlotMenuOpen(false);
            }}
            onDeletePlot={() => {
              setPendingDelete(activePlot);
              setPlotMenuOpen(false);
            }}
            onToggleMenu={() => setPlotMenuOpen((current) => !current)}
            onDragPlot={setDraggedPlot}
            onDropPlot={(targetId) => {
              if (draggedPlot) void reorderPlots(draggedPlot, targetId);
              setDraggedPlot(null);
            }}
            onNewBlock={(act) => openBlockDraft({
              act,
              plotId: activePlot.id,
              title: "",
              body: "",
              characterIds: [],
              documentIds: [],
            })}
            onInspectBlock={inspectBlock}
            onEditAct={setActDraft}
            onNewAct={() => void createAct()}
            onDrag={setDraggedBlock}
            onDrop={moveBlock}
            foundryPackage={
              foundryPackages.find((item) => item.workSlug === readFoundrySyncInfo(activePlot.meta)?.workSlug)
              ?? foundryPackages.find((item) => item.title.trim() === project.title.trim())
              ?? null
            }
            foundrySyncing={foundrySyncing}
            foundrySyncMessage={foundrySyncMessage}
            onSyncFoundry={() => void syncFoundryProjection()}
          />
        )}
        {view === "plot" && !activePlot && (
          <div className="plot-initializing">첫 플롯을 준비하는 중…</div>
        )}
        {view === "documents" && (
          <Documents selected={selectedDocument} onSave={saveDocument} onNew={() => createDocument(null)} />
        )}
        {view === "manuscript" && <ManuscriptView projectId={projectId} />}
        {view === "publish" && <PublishView project={project} items={items} blocks={blocks} />}
      </section>

      {blockDraft && (
        <BlockInspector
          draft={blockDraft}
          actTitle={columns.find((column) => column.act === blockDraft.act)?.title ?? `${blockDraft.act}아크`}
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
              plotId: activePlot?.id ?? defaultPlot?.id ?? "",
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
      {plotDraft && (
        <PlotEditorModal
          draft={plotDraft}
          setDraft={setPlotDraft}
          onSubmit={savePlot}
          onClose={() => setPlotDraft(null)}
        />
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
  plots: Item[];
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
      <Link className="back-home" href="/studio">⌂ 개인 작업실</Link>
      <div className="project-identity"><span>{props.project.genre}</span><strong>{props.project.title}</strong></div>
      <label className="sidebar-search">⌕<input placeholder="검색…" aria-label="작품 검색" /></label>
      <nav className="project-nav" aria-label="작품 메뉴">
        <Link className={props.view === "overview" ? "active" : ""} href={`/project/${props.projectId}`}>◇ <span>작품 개요</span></Link>
        <Link className={props.view === "characters" ? "active" : ""} href={`/project/${props.projectId}/characters`}>♙ <span>등장인물</span><b>{props.characters.length}</b></Link>
        <Link className={props.view === "plot" ? "active" : ""} href={`/project/${props.projectId}/plot`}>▦ <span>플롯</span><b>{props.plots.length}</b></Link>
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
      <nav className="project-secondary-nav" aria-label="원고와 공개 관리">
        <Link className={props.view === "manuscript" ? "active" : ""} href={`/project/${props.projectId}/manuscript`}>
          <FileText size={17} /><span>원고</span>
        </Link>
        <Link className={props.view === "publish" ? "active" : ""} href={`/project/${props.projectId}/publish`}>
          <GlobeHemisphereWest size={17} /><span>공개 관리</span>
        </Link>
      </nav>
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
  const [coverKey, setCoverKey] = useState<CoverKey>(project.coverKey);
  useEffect(() => setCoverKey(project.coverKey), [project.coverKey]);
  return (
    <div className="page-narrow">
      <PageHeader kicker="WORK OVERVIEW" title="작품 개요" description="작품의 중심 약속을 짧게 고정해 두는 곳." />
      <form className="overview-form" onSubmit={onSave}>
        <label>작품 제목<input name="title" defaultValue={project.title} /></label>
        <label>한 줄 소개<textarea name="logline" defaultValue={project.logline} /></label>
        <label>장르<input name="genre" defaultValue={project.genre} /></label>
        <CoverPicker value={coverKey} onChange={setCoverKey} />
        <button className="black-button" type="submit">변경사항 저장</button>
      </form>
    </div>
  );
}

type Manuscript = {
  id: string;
  projectId: string;
  episodeNo: number;
  title: string;
  body: string;
  status: string;
  meta: string;
  updatedAt: string;
};

function ManuscriptView({ projectId }: { projectId: string }) {
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Manuscript | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectId}/manuscripts`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const rows: Manuscript[] = data.manuscripts ?? [];
        setManuscripts(rows);
        const chosen = rows[0] ?? null;
        setSelectedId(chosen?.id ?? null);
        setDraft(chosen);
      });
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  async function create() {
    const response = await fetch(`/api/projects/${projectId}/manuscripts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!data.manuscript) return;
    setManuscripts((current) => [...current, data.manuscript]);
    setSelectedId(data.manuscript.id);
    setDraft(data.manuscript);
  }

  function select(item: Manuscript) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSelectedId(item.id);
    setDraft(item);
    setStatus("idle");
  }

  function change(update: Partial<Manuscript>) {
    if (!draft) return;
    if (readFoundrySyncInfo(draft.meta)?.authority === "owner_approved_manuscript") return;
    const next = { ...draft, ...update };
    setDraft(next);
    setManuscripts((current) => current.map((item) => item.id === next.id ? next : item));
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/manuscripts/${next.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: next.title, body: next.body }),
        });
        if (!response.ok) throw new Error("save failed");
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 600);
  }

  async function remove() {
    if (!draft || !window.confirm(`${draft.episodeNo}화 원고를 삭제할까?`)) return;
    await fetch(`/api/manuscripts/${draft.id}`, { method: "DELETE" });
    const remaining = manuscripts.filter((item) => item.id !== draft.id);
    setManuscripts(remaining);
    setDraft(remaining[0] ?? null);
    setSelectedId(remaining[0]?.id ?? null);
  }

  return (
    <div className="page-wide manuscript-page">
      <PageHeader
        kicker="MANUSCRIPT"
        title={`원고 ${manuscripts.length}`}
        description="실제 공개할 회차를 쓰고 자동 저장합니다."
        action={<button className="black-button" onClick={create}>＋ 새 원고</button>}
      />
      <div className="manuscript-layout">
        <aside className="manuscript-list">
          {manuscripts.map((item) => (
            <button key={item.id} className={item.id === selectedId ? "active" : ""} onClick={() => select(item)}>
              <span>{item.episodeNo}화</span><strong>{item.title}</strong><small>{item.status === "published" ? "공개 중" : "비공개"}</small>
            </button>
          ))}
          {!manuscripts.length && <div className="tree-empty root">첫 원고를 추가해 보세요.</div>}
        </aside>
        {draft ? (
          <section className="manuscript-editor">
            {readFoundrySyncInfo(draft.meta)?.authority === "owner_approved_manuscript" && (
              <div className="publication-sync-note">
                <strong>Foundry 승인 정본</strong>
                <span>개인 작업실과 커뮤니티가 같은 정본을 사용합니다. 수정은 Foundry에서 승인 후 전체 동기화합니다.</span>
              </div>
            )}
            <div className="manuscript-editor-head">
              <span>{draft.episodeNo}화</span>
              <div className={`save-indicator ${status}`}>{readFoundrySyncInfo(draft.meta)?.authority === "owner_approved_manuscript" ? "정본 잠금" : status === "saving" ? "저장 중…" : status === "saved" ? "저장됨" : status === "error" ? "저장 실패" : "자동저장"}</div>
              {!readFoundrySyncInfo(draft.meta) && <button type="button" onClick={remove}>삭제</button>}
            </div>
            <input className="manuscript-title" readOnly={Boolean(readFoundrySyncInfo(draft.meta))} value={draft.title} onChange={(event) => change({ title: event.target.value })} aria-label="원고 제목" />
            <textarea className="manuscript-body" readOnly={Boolean(readFoundrySyncInfo(draft.meta))} value={draft.body} onChange={(event) => change({ body: event.target.value })} placeholder="이 회차의 원고를 입력하세요." />
            <footer><span>공백 포함 {draft.body.length.toLocaleString("ko")}자</span><span>{draft.status === "published" ? "현재 커뮤니티에 공개된 사본이 있음." : "공개 관리에서 공개할 수 있음."}</span></footer>
          </section>
        ) : (
          <div className="blank-state">원고를 선택하거나 새로 추가해 주세요.</div>
        )}
      </div>
    </div>
  );
}

function PublishView({ project, items, blocks }: { project: Project; items: Item[]; blocks: Block[] }) {
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [publication, setPublication] = useState<{
    status?: string;
    slug?: string;
    authorName?: string;
    coverKey?: CoverKey;
    updatedAt?: string;
    revision?: string;
    publishedRevision?: string;
    needsUpdate?: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [unpublishPending, setUnpublishPending] = useState(false);
  const characters = items.filter((item) => item.kind === "character");
  const documents = items.filter((item) => item.kind === "document");
  const plots = items.filter((item) => item.kind === "plot");
  const acts = items.filter((item) => item.kind === "act");
  const canonBound = manuscripts.some((item) => Boolean(readFoundrySyncInfo(item.meta)))
    || items.some((item) => Boolean(readFoundrySyncInfo(item.meta)))
    || blocks.some((item) => Boolean(readFoundrySyncInfo(item.meta)));

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${project.id}/manuscripts`).then((response) => response.json()),
      fetch(`/api/projects/${project.id}/publication`).then((response) => response.json()),
    ]).then(([manuscriptData, publicationData]) => {
      const rows: Manuscript[] = manuscriptData.manuscripts ?? [];
      setManuscripts(rows);
      setPublication(publicationData.publication ?? null);
    });
  }, [project.id]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/projects/${project.id}/publication`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authorName: form.get("authorName"),
        publishAll: true,
        publishCanon: canonBound,
      }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(data.error || "공개하지 못했음.");
    setPublication({ ...data.publication, revision: data.revision, needsUpdate: false });
    broadcastPublicationUpdate({
      projectId: project.id,
      slug: data.publication.slug,
      revision: data.revision,
    });
    setMessage("원고·등장인물·자료·플롯 전체 공개본을 갱신했음.");
  }

  async function unpublish() {
    if (unpublishPending) return;
    setUnpublishPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/publication`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "공개를 중지하지 못했음.");
      setPublication((current) => current ? { ...current, status: "draft", revision: data.revision, updatedAt: data.updatedAt } : null);
      broadcastPublicationUpdate({
        projectId: project.id,
        slug: publication?.slug,
        revision: data.revision,
      });
      setMessage("커뮤니티에서 내렸음. 개인 작업 데이터는 그대로임.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공개를 중지하지 못했음.");
    } finally {
      setUnpublishPending(false);
    }
  }

  return (
    <div className="page-narrow publish-page">
      <PageHeader kicker="PUBLISH" title="공개 관리" description="버튼 한 번으로 현재 작업실의 원고·등장인물·자료·플롯 전체를 공개합니다." />
      <form className="publish-form" onSubmit={publish}>
        <div className="publication-status">
          <div>
            <strong>{publication?.status === "published" ? "현재 공개 중" : "현재 비공개"}</strong>
            {publication?.status === "published" && (
              <span className={`publication-revision-badge ${publication.needsUpdate ? "stale" : "current"}`}>
                {publication.needsUpdate ? "공개본 업데이트 필요" : "최신 공개본"}
              </span>
            )}
            {publication?.updatedAt && <small>최근 반영 {formatPublicationTime(publication.updatedAt)}</small>}
          </div>
          {publication?.slug && (
            <Link
              href={`/works/${publication.slug}?v=${encodeURIComponent(publication.revision || publication.updatedAt || "")}`}
              prefetch={false}
            >
              공개 페이지 보기 →
            </Link>
          )}
        </div>
        <div className="publication-sync-note"><strong>작품 기본 정보 자동 동기화</strong><span>제목·소개·장르는 작업실의 작품 개요를 저장하면 공개 페이지에도 바로 반영됨.</span></div>
        {canonBound && <div className="publication-sync-note"><strong>Foundry 정본 연결됨</strong><span>개인 원고와 커뮤니티 공개본은 정본 전체 동기화로 함께 갱신됩니다.</span></div>}
        <dl className="publication-project-info"><div><dt>제목</dt><dd>{project.title}</dd></div><div><dt>장르</dt><dd>{project.genre}</dd></div><div><dt>소개</dt><dd>{project.logline}</dd></div></dl>
        <label>필명<input name="authorName" defaultValue={publication?.authorName || ""} placeholder="커뮤니티에 표시할 이름" /></label>
        <div className="cover-preview">
          <img src={resolveCoverSrc(project.coverKey)} alt="선택한 작품 표지 미리보기" />
          <p>표지는 작품 개요 또는 내 작품의 ··· 메뉴에서 바꿀 수 있음. 공개 중이면 커뮤니티에도 즉시 반영됨.</p>
        </div>
        <section className="publish-all-summary" aria-label="전체 공개 대상">
          <div><strong>{manuscripts.length}</strong><span>원고</span></div>
          <div><strong>{characters.length}</strong><span>등장인물</span></div>
          <div><strong>{documents.length}</strong><span>자료</span></div>
          <div><strong>{plots.length}</strong><span>플롯</span></div>
          <div><strong>{acts.length}</strong><span>아크</span></div>
          <div><strong>{blocks.length}</strong><span>블록</span></div>
          <p>공개할 때의 작업실 전체를 읽기 전용 사본으로 만듭니다. 이후 다시 누르면 최신 상태로 통째로 갱신됩니다.</p>
        </section>
        {!manuscripts.length && <p className="tree-empty root">원고 메뉴에서 먼저 회차를 작성해 주세요.</p>}
        {message && <p className="inline-message" aria-live="polite">{message}</p>}
        <div className="publish-actions">
          <button className="black-button" disabled={pending || !manuscripts.length}>{pending ? "전체 공개 중…" : canonBound ? publication?.status === "published" ? "정본 공개본 갱신" : "정본 전체 공개" : publication?.status === "published" ? "전체 공개본 갱신" : "전체 공개"}</button>
          {publication?.status === "published" && (
            <>
              <button type="button" className="outline-cancel" onClick={unpublish} disabled={unpublishPending}>
                {unpublishPending ? "중지 중…" : "공개 중지"}
              </button>
              {publication.slug && (
                <a
                  className="outline-cancel"
                  href={`/works/${publication.slug}?v=${encodeURIComponent(publication.revision || publication.updatedAt || "")}`}
                >
                  갱신 후 보기
                </a>
              )}
            </>
          )}
        </div>
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
  const characterBlocks = (characterId: string) =>
    blocks
      .filter((block) => readBlockLinks(block.meta).characterIds.includes(characterId))
      .sort((left, right) => right.sortOrder - left.sortOrder);
  const backlinkCount = (characterId: string) => characterBlocks(characterId).length;
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
        <span>이름</span><span>태그와 설명</span><span>연결 블록</span>
      </div>
      <div className="character-list">
        {visible.map((character) => {
          const meta = readCharacterMeta(character);
          const linkedBlocks = characterBlocks(character.id);
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
                <span className="character-links">
                  {linkedBlocks.slice(0, 3).map((block) => (
                    <span key={block.id}>{block.title}</span>
                  ))}
                  {!linkedBlocks.length && <span className="character-links-empty">0개 블록</span>}
                  {linkedBlocks.length > 3 && <b>＋{linkedBlocks.length - 3}</b>}
                </span>
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
  plots: Item[];
  activePlot: Item;
  columns: Array<{ act: number; title: string; body: string; meta: string; blocks: Block[] }>;
  creatingAct: boolean;
  menuOpen: boolean;
  draggedPlot: string | null;
  onSelectPlot: (id: string) => void;
  onNewPlot: () => void;
  onEditPlot: () => void;
  onDeletePlot: () => void;
  onToggleMenu: () => void;
  onDragPlot: (id: string) => void;
  onDropPlot: (id: string) => void;
  onNewBlock: (act: number) => void;
  onInspectBlock: (block: Block) => void;
  onEditAct: (draft: Draft) => void;
  onNewAct: () => void;
  onDrag: (id: string) => void;
  onDrop: (act: number) => void;
  foundryPackage: FoundryPackageSummary | null;
  foundrySyncing: boolean;
  foundrySyncMessage: string;
  onSyncFoundry: () => void;
}) {
  const [collapsedActs, setCollapsedActs] = useState<number[]>([]);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const previousColumnCountRef = useRef(props.columns.length);

  useEffect(() => {
    if (props.columns.length > previousColumnCountRef.current) {
      const board = boardScrollRef.current;
      if (board) board.scrollTo({ left: board.scrollWidth, behavior: "smooth" });
    }
    previousColumnCountRef.current = props.columns.length;
  }, [props.columns.length]);

  function toggleAct(act: number) {
    setCollapsedActs((current) =>
      current.includes(act) ? current.filter((value) => value !== act) : [...current, act],
    );
  }

  return (
    <div className="plot-page">
      <div className="plot-tabs-bar" role="tablist" aria-label="플롯 탭">
        <div className="plot-tabs-scroll">
          {props.plots.map((plot) => {
            const selected = plot.id === props.activePlot.id;
            return (
              <button
                className={`plot-tab ${selected ? "active" : ""} ${props.draggedPlot === plot.id ? "dragging" : ""}`}
                key={plot.id}
                role="tab"
                aria-selected={selected}
                draggable
                onDragStart={() => props.onDragPlot(plot.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  props.onDropPlot(plot.id);
                }}
                onClick={() => props.onSelectPlot(plot.id)}
              >
                <span>{plot.title}</span>
              </button>
            );
          })}
          <button className="new-plot-tab" type="button" onClick={props.onNewPlot}>
            <Plus size={17} weight="bold" aria-hidden="true" />
            <span>새 플롯</span>
          </button>
        </div>
      </div>

      <div className="plot-content">
        <header className="plot-heading">
          <div>
            <div className="plot-title-line">
              <h1>{props.activePlot.title}</h1>
              <div className="plot-menu-wrap">
                <button
                  className="plot-menu-trigger"
                  type="button"
                  aria-label="플롯 관리"
                  aria-expanded={props.menuOpen}
                  onClick={props.onToggleMenu}
                >
                  <DotsThree size={22} weight="bold" aria-hidden="true" />
                </button>
                {props.menuOpen && (
                  <div className="plot-menu">
                    <button type="button" onClick={props.onEditPlot}>
                      <PencilSimple size={16} aria-hidden="true" />
                      이름과 소개 편집
                    </button>
                    <button
                      className="danger"
                      type="button"
                      disabled={props.plots.length <= 1}
                      onClick={props.onDeletePlot}
                    >
                      <Trash size={16} aria-hidden="true" />
                      플롯 삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p>{props.activePlot.body || "TBD"}</p>
          </div>
          {props.foundryPackage && (
            <div className="foundry-sync-panel">
              <span>FOUNDRY SSOT · {props.foundryPackage.currentBArc} / {props.foundryPackage.currentEpisode}</span>
              <button type="button" disabled={props.foundrySyncing} onClick={props.onSyncFoundry}>
                <ArrowsClockwise size={16} weight="bold" aria-hidden="true" />
                {props.foundrySyncing ? "동기화 중…" : "정본 전체 동기화"}
              </button>
              {props.foundrySyncMessage && <small>{props.foundrySyncMessage}</small>}
            </div>
          )}
        </header>

        <div className="plot-board-scroll" ref={boardScrollRef} aria-label="아크 보드">
          <div className="plot-board">
            {props.columns.map((column) => {
              const collapsed = collapsedActs.includes(column.act);
              const arcSync = readFoundrySyncInfo(column.meta);
              return (
                <article
                  className={`act-column ${collapsed ? "collapsed" : ""}`}
                  key={column.act}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => props.onDrop(column.act)}
                >
                  <div className="act-heading">
                    <button
                      className="act-title-button"
                      onClick={() => props.onEditAct({ act: column.act, title: column.title, body: column.body })}
                    >
                      <strong>{column.title}</strong>
                      {!collapsed && <p>{column.body}</p>}
                      {arcSync && <span className={`foundry-sync-state state-${arcSync.status}`}>{arcSync.status}</span>}
                    </button>
                    <div className="act-heading-actions">
                      <span className="act-count" aria-label={`${column.blocks.length}개 블록`}>{column.blocks.length}</span>
                      <button
                        className="act-collapse"
                        type="button"
                        aria-expanded={!collapsed}
                        aria-label={`${column.title} ${collapsed ? "펼치기" : "접기"}`}
                        onClick={() => toggleAct(column.act)}
                      >
                        {collapsed ? "펼치기" : "접기"}
                      </button>
                    </div>
                  </div>
                  {!collapsed && (
                    <>
                      <div className="block-stack">
                        {column.blocks.map((block) => {
                          const links = readBlockLinks(block.meta);
                          const blockSync = readFoundrySyncInfo(block.meta);
                          return (
                            <button className="plot-card" key={block.id} draggable onDragStart={() => props.onDrag(block.id)} onClick={() => props.onInspectBlock(block)}>
                              <strong>{block.title}</strong>
                              <p>{blockBodyPreview(block.body) || "이 블록에서 벌어지는 사건을 적어."}</p>
                              {blockSync && <span className={`foundry-sync-state state-${blockSync.status}`}>{blockSync.status === "committed" ? "정본 화" : "가설 화"}</span>}
                              {(links.characterIds.length > 0 || links.documentIds.length > 0) && (
                                <span className="plot-card-links">인물 {links.characterIds.length} · 문서 {links.documentIds.length}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <button className="add-block" onClick={() => props.onNewBlock(column.act)}>＋ 새 블록</button>
                    </>
                  )}
                </article>
              );
            })}
            <button className="add-act-column" type="button" onClick={props.onNewAct} disabled={props.creatingAct}>
              <Plus size={22} weight="bold" aria-hidden="true" />
              <strong>{props.columns.length + 1}아크 추가</strong>
              <span>{props.creatingAct ? "추가 중…" : "보드를 계속 이어서 만들기"}</span>
            </button>
          </div>
        </div>
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
                  <span>{block.act}아크</span><strong>{block.title}</strong><p>{blockBodyPreview(block.body) || "내용 없음"}</p>
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

function PlotEditorModal(props: {
  draft: PlotDraft;
  setDraft: (draft: PlotDraft | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="modal-card plot-editor-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h2>플롯 정보 편집</h2>
          <button type="button" className="icon-button" aria-label="플롯 편집 닫기" onClick={props.onClose}>×</button>
        </div>
        <label>
          플롯 이름
          <input
            autoFocus
            value={props.draft.title}
            onChange={(event) => props.setDraft({ ...props.draft, title: event.target.value })}
          />
        </label>
        <label>
          한 줄 소개
          <textarea
            value={props.draft.body}
            onChange={(event) => props.setDraft({ ...props.draft, body: event.target.value })}
          />
        </label>
        <button className="black-button" type="submit">저장</button>
      </form>
    </div>
  );
}

function ConfirmDeleteModal({ item, onClose, onConfirm }: { item: Item; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><h2 id="delete-title">{item.kind === "folder" ? "폴더 삭제" : item.kind === "character" ? "인물 삭제" : item.kind === "plot" ? "플롯 삭제" : "문서 삭제"}</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <p><strong>{item.title}</strong>을(를) 삭제할까? {item.kind === "folder" ? "안의 문서는 최상위로 이동됨." : item.kind === "plot" ? "이 플롯의 아크와 블록도 함께 삭제되며 되돌릴 수 없음." : "이 작업은 되돌릴 수 없음."}</p>
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
      plotId: typeof value.plotId === "string" ? value.plotId : "",
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

function readPlotMeta(item: Pick<Item, "meta" | "updatedAt">): PlotMeta {
  const value = readObject(item.meta);
  return {
    isDefault: value.isDefault === true,
    sortOrder:
      typeof value.sortOrder === "number"
        ? value.sortOrder
        : item.updatedAt
          ? new Date(item.updatedAt).getTime()
          : Date.now(),
  };
}

function belongsToPlot(meta: string, plotId: string, isDefaultPlot: boolean) {
  const value = readObject(meta).plotId;
  return typeof value === "string" && value ? value === plotId : isDefaultPlot;
}

function normalizeArcTitle(title: string | undefined, act: number) {
  const value = title?.trim();
  if (!value || value === "TBD") return `${act}아크`;
  if (/^\d+\s*막\s*·\s*(각성|진실과 갈등|결전과 선택)$/.test(value)) return `${act}아크`;
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

function blockBodyPreview(body: string, maxLength = 320) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function documentFolder(item: Item) {
  const value = readObject(item.meta).folderId;
  return typeof value === "string" && value ? value : null;
}

function readBlockLinks(meta: string) {
  const value = readObject(meta);
  return {
    plotId: typeof value.plotId === "string" && value.plotId ? value.plotId : null,
    characterIds: Array.isArray(value.characterIds) ? value.characterIds.filter((id): id is string => typeof id === "string") : [],
    documentIds: Array.isArray(value.documentIds) ? value.documentIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function readFoundrySyncInfo(meta: string) {
  const value = readObject(meta).foundrySync;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.workSlug !== "string" || typeof record.entityKey !== "string") return null;
  return {
    workSlug: record.workSlug,
    entityKey: record.entityKey,
    status: typeof record.status === "string" ? record.status : "synced",
    authority: typeof record.authority === "string" ? record.authority : "",
    sourceCommit: typeof record.sourceCommit === "string" ? record.sourceCommit : "",
  };
}

function formatPublicationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
}

function readObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
