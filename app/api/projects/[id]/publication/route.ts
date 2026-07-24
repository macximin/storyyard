import { asc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { manuscripts, plotBlocks, projectItems, publicationContent, publicationEpisodes, publications, projects } from "@/db/schema";

async function ownedProject(projectId: string, ownerKey: string) {
  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId));
  return project?.ownerEmail === ownerKey ? project : null;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  const [publication] = await getDb().select().from(publications).where(eq(publications.projectId, id));
  const episodeRows = publication
    ? await getDb().select().from(publicationEpisodes)
      .where(eq(publicationEpisodes.publicationId, publication.id))
      .orderBy(asc(publicationEpisodes.episodeNo))
    : [];
  const contentRows = publication
    ? await getDb().select().from(publicationContent)
      .where(eq(publicationContent.publicationId, publication.id))
      .orderBy(asc(publicationContent.kind), asc(publicationContent.sortOrder))
    : [];
  return Response.json({
    publication: publication ?? null,
    episodes: episodeRows,
    content: {
      characterIds: contentRows.filter((item) => item.kind === "character").map((item) => item.sourceId),
      characterFieldIds: Object.fromEntries(contentRows.filter((item) => item.kind === "character").map((item) => [item.sourceId, readMeta(item.meta).fields.map((field) => field.id)])),
      documentIds: contentRows.filter((item) => item.kind === "document").map((item) => item.sourceId),
      plotIds: contentRows.filter((item) => item.kind === "plot").map((item) => item.sourceId),
      actIds: contentRows.filter((item) => item.kind === "act").map((item) => item.sourceId),
      blockIds: contentRows.filter((item) => item.kind === "block").map((item) => item.sourceId),
    },
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id: projectId } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const project = await ownedProject(projectId, user.email);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  const input = await request.json() as Partial<{
    coverUrl: string;
    authorName: string;
    episodeIds: string[];
    characterIds: string[];
    characterFieldIds: Record<string, string[]>;
    documentIds: string[];
    plotIds: string[];
    actIds: string[];
    blockIds: string[];
  }>;
  const episodeIds = Array.isArray(input.episodeIds) ? input.episodeIds.filter(Boolean) : [];
  if (!episodeIds.length) {
    return Response.json({ error: "공개할 원고를 한 편 이상 골라 줘." }, { status: 400 });
  }
  const selected = await getDb().select().from(manuscripts)
    .where(inArray(manuscripts.id, episodeIds))
    .orderBy(asc(manuscripts.episodeNo));
  if (selected.length !== episodeIds.length || selected.some((item) => item.projectId !== projectId)) {
    return Response.json({ error: "공개 원고 선택이 올바르지 않음." }, { status: 400 });
  }

  const db = getDb();
  const [allItems, allBlocks] = await Promise.all([
    db.select().from(projectItems).where(eq(projectItems.projectId, projectId)),
    db.select().from(plotBlocks).where(eq(plotBlocks.projectId, projectId)).orderBy(asc(plotBlocks.act), asc(plotBlocks.sortOrder)),
  ]);
  const itemById = new Map(allItems.map((item) => [item.id, item]));
  const blockById = new Map(allBlocks.map((block) => [block.id, block]));
  const requested = {
    characterIds: uniqueStrings(input.characterIds),
    documentIds: uniqueStrings(input.documentIds),
    plotIds: uniqueStrings(input.plotIds),
    actIds: uniqueStrings(input.actIds),
    blockIds: uniqueStrings(input.blockIds),
  };
  if (
    !validItemKinds(requested.characterIds, itemById, "character") ||
    !validItemKinds(requested.documentIds, itemById, "document") ||
    !validItemKinds(requested.plotIds, itemById, "plot") ||
    !validItemKinds(requested.actIds, itemById, "act") ||
    requested.blockIds.some((id) => !blockById.has(id))
  ) {
    return Response.json({ error: "공개 정보 선택이 작업실 데이터와 맞지 않음." }, { status: 400 });
  }
  const [existing] = await db.select().from(publications).where(eq(publications.projectId, projectId));
  const timestamp = new Date().toISOString();
  const publicationId = existing?.id ?? crypto.randomUUID();
  const publication = {
    id: publicationId,
    projectId,
    ownerUserId: user.id,
    slug: existing?.slug ?? `work-${publicationId.slice(0, 8)}`,
    // 작품 기본 정보는 작업실 원본이 항상 공개본보다 우선한다.
    title: project.title,
    logline: project.logline,
    genre: project.genre,
    coverUrl: safeCoverUrl(input.coverUrl || existing?.coverUrl),
    authorName: input.authorName?.trim() || user.displayName,
    status: "published",
    publishedAt: existing?.publishedAt ?? timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    await db.update(publications).set(publication).where(eq(publications.id, publicationId));
  } else {
    await db.insert(publications).values(publication);
  }

  const batch = [
    env.DB.prepare("DELETE FROM publication_episodes WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM publication_content WHERE publication_id = ?").bind(publicationId),
    ...selected.map((item) =>
      env.DB.prepare(
        `INSERT INTO publication_episodes
          (id, publication_id, source_manuscript_id, episode_no, title, body, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        publicationId,
        item.id,
        item.episodeNo,
        item.title,
        item.body,
        timestamp,
        timestamp,
      ),
    ),
    ...buildContentSnapshots({
      allItems,
      allBlocks,
      requested,
      characterFieldIds: input.characterFieldIds ?? {},
    }).map((item) =>
      env.DB.prepare(
        `INSERT INTO publication_content
          (id, publication_id, source_id, kind, parent_source_id, sort_order, title, body, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), publicationId, item.sourceId, item.kind, item.parentSourceId,
        item.sortOrder, item.title, item.body, item.meta, timestamp, timestamp,
      ),
    ),
  ];
  await env.DB.batch(batch);
  await db.update(manuscripts).set({ status: "draft" }).where(eq(manuscripts.projectId, projectId));
  await db.update(manuscripts).set({ status: "published" }).where(inArray(manuscripts.id, episodeIds));
  return Response.json({ publication });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  await getDb().update(publications).set({
    status: "draft",
    updatedAt: new Date().toISOString(),
  }).where(eq(publications.projectId, id));
  return Response.json({ ok: true });
}

function safeCoverUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "/default-cover.png";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : "/default-cover.png";
  } catch {
    return "/default-cover.png";
  }
}

type ContentRow = {
  sourceId: string;
  kind: "character" | "document" | "plot" | "act" | "block";
  parentSourceId: string;
  sortOrder: number;
  title: string;
  body: string;
  meta: string;
};

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item)))] : [];
}

function validItemKinds(ids: string[], items: Map<string, { kind: string }>, kind: string) {
  return ids.every((id) => items.get(id)?.kind === kind);
}

function readMeta(value: string): { plotId: string; act: number; tags: string[]; fields: Array<{ id: string; label: string; value: string }> } {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const fields = Array.isArray(parsed.fields)
      ? parsed.fields.flatMap((field) => {
        if (!field || typeof field !== "object") return [];
        const record = field as Record<string, unknown>;
        return typeof record.id === "string" ? [{
          id: record.id,
          label: typeof record.label === "string" ? record.label : "",
          value: typeof record.value === "string" ? record.value : "",
        }] : [];
      })
      : [];
    return {
      plotId: typeof parsed.plotId === "string" ? parsed.plotId : "",
      act: typeof parsed.act === "number" ? parsed.act : 0,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string") : [],
      fields,
    };
  } catch {
    return { plotId: "", act: 0, tags: [], fields: [] };
  }
}

function buildContentSnapshots({
  allItems,
  allBlocks,
  requested,
  characterFieldIds,
}: {
  allItems: Array<{ id: string; kind: string; title: string; body: string; meta: string }>;
  allBlocks: Array<{ id: string; act: number; title: string; body: string; meta: string; sortOrder: number }>;
  requested: { characterIds: string[]; documentIds: string[]; plotIds: string[]; actIds: string[]; blockIds: string[] };
  characterFieldIds: Record<string, string[]>;
}): ContentRow[] {
  const result: ContentRow[] = [];
  const itemById = new Map(allItems.map((item) => [item.id, item]));
  const impliedPlotIds = new Set(requested.plotIds);
  for (const id of [...requested.actIds, ...requested.blockIds]) {
    const source = itemById.get(id) ?? allBlocks.find((block) => block.id === id);
    const plotId = source ? readMeta(source.meta).plotId : "";
    if (plotId) impliedPlotIds.add(plotId);
  }

  requested.characterIds.forEach((id, index) => {
    const item = itemById.get(id)!;
    const meta = readMeta(item.meta);
    const selectedFields = new Set(uniqueStrings(characterFieldIds[id]));
    result.push({
      sourceId: item.id, kind: "character", parentSourceId: "", sortOrder: index,
      title: item.title, body: item.body,
      meta: JSON.stringify({ tags: meta.tags, fields: meta.fields.filter((field) => selectedFields.has(field.id)) }),
    });
  });
  requested.documentIds.forEach((id, index) => {
    const item = itemById.get(id)!;
    result.push({ sourceId: item.id, kind: "document", parentSourceId: "", sortOrder: index, title: item.title, body: item.body, meta: "{}" });
  });
  [...impliedPlotIds].forEach((id, index) => {
    const item = itemById.get(id);
    if (!item || item.kind !== "plot") return;
    result.push({ sourceId: item.id, kind: "plot", parentSourceId: "", sortOrder: index, title: item.title, body: item.body, meta: "{}" });
  });
  requested.actIds.forEach((id, index) => {
    const item = itemById.get(id)!;
    const meta = readMeta(item.meta);
    result.push({ sourceId: item.id, kind: "act", parentSourceId: meta.plotId, sortOrder: meta.act || index + 1, title: item.title, body: item.body, meta: JSON.stringify({ act: meta.act || index + 1 }) });
  });
  requested.blockIds.forEach((id, index) => {
    const block = allBlocks.find((item) => item.id === id)!;
    const meta = readMeta(block.meta);
    result.push({ sourceId: block.id, kind: "block", parentSourceId: meta.plotId, sortOrder: block.sortOrder || index, title: block.title, body: block.body, meta: JSON.stringify({ act: block.act }) });
  });
  return result;
}
