import { asc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { consumeHumanActionGrant, getChatGPTUser } from "@/app/chatgpt-auth";
import { getSyncableCanonPackage } from "@/app/canon-packages";
import { getCoverOption } from "@/app/cover-options";
import { getDb } from "@/db";
import { canonBindings, manuscripts, plotBlocks, projectItems, publicationContent, publicationEpisodes, publications, projects } from "@/db/schema";

async function ownedProject(projectId: string, ownerKey: string) {
  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId));
  return project?.ownerEmail === ownerKey && project.lifecycle === "active" ? project : null;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const project = await ownedProject(id, user.email);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
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
    publication: publication ? {
      ...publication,
      revision: publication.updatedAt,
      needsUpdate: publication.publishedRevision !== project.contentRevision,
    } : null,
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
  if (user.role !== "admin") {
    return Response.json({ error: "공개 작업은 인간 관리자 확인이 필요함." }, { status: 403 });
  }
  const [canonBinding] = await getDb().select().from(canonBindings).where(eq(canonBindings.projectId, projectId));
  const input = await request.json() as Partial<{
    publishAll: boolean;
    publishCanon: boolean;
    humanActionToken: string;
    authorName: string;
    episodeIds: string[];
    characterIds: string[];
    characterFieldIds: Record<string, string[]>;
    documentIds: string[];
    plotIds: string[];
    actIds: string[];
    blockIds: string[];
  }>;
  const publishCanon = Boolean(canonBinding) && input.publishCanon === true && user.role === "admin";
  if (canonBinding && !publishCanon) {
    return Response.json({
      error: "Foundry 정본 작품의 공개본은 인간 관리자 확인이 있는 별도 정본 공개 작업으로만 갱신할 수 있음.",
    }, { status: 409 });
  }
  const canonPackage = publishCanon ? getSyncableCanonPackage(canonBinding.workSlug) : null;
  if (
    publishCanon
    && (
      input.publishAll !== true
      || !canonPackage
      || canonBinding.sourceCommit !== canonPackage.sourceGitCommit
      || canonBinding.bundleSha256 !== canonPackage.bundleSha256
      || canonBinding.revisionSetSha256 !== canonPackage.revisionSetSha256
    )
  ) {
    return Response.json({
      error: "현재 Foundry 정본 binding과 개인 작업실 공개 요청이 정확히 일치하지 않음.",
    }, { status: 409 });
  }
  const db = getDb();
  const publishAll = input.publishAll === true;
  const manuscriptRows = publishAll
    ? await db.select().from(manuscripts)
      .where(eq(manuscripts.projectId, projectId))
      .orderBy(asc(manuscripts.episodeNo))
    : [];
  const allManuscripts = publishCanon
    ? manuscriptRows.filter((item) => matchesCurrentCanon(item.meta, canonBinding))
    : manuscriptRows;
  if (publishCanon) {
    const expectedManuscriptKeys = new Set(
      canonPackage.workspaceProjection.manuscripts.map((item) => `manuscript:${item.entityKey}`),
    );
    const actualManuscriptKeys = new Set(
      allManuscripts.flatMap((item) => {
        const identity = readFoundryIdentity(item.meta);
        return identity ? [identity.entityKey] : [];
      }),
    );
    if (
      expectedManuscriptKeys.size !== actualManuscriptKeys.size
      || [...expectedManuscriptKeys].some((key) => !actualManuscriptKeys.has(key))
    ) {
      return Response.json({
        error: "현재 정본 원고 집합이 완전하지 않아 공개를 중단했음.",
      }, { status: 409 });
    }
  }
  const episodeIds = publishAll
    ? allManuscripts.map((item) => item.id)
    : Array.isArray(input.episodeIds) ? input.episodeIds.filter(Boolean) : [];
  if (!episodeIds.length) {
    return Response.json({ error: "공개할 원고가 아직 없음. 원고를 한 편 이상 작성해 줘." }, { status: 400 });
  }
  const selected = publishAll ? allManuscripts : await db.select().from(manuscripts)
    .where(inArray(manuscripts.id, episodeIds))
    .orderBy(asc(manuscripts.episodeNo));
  if (selected.length !== episodeIds.length || selected.some((item) => item.projectId !== projectId)) {
    return Response.json({ error: "공개 원고 선택이 올바르지 않음." }, { status: 400 });
  }

  const [itemRows, blockRows] = await Promise.all([
    db.select().from(projectItems).where(eq(projectItems.projectId, projectId)),
    db.select().from(plotBlocks).where(eq(plotBlocks.projectId, projectId)).orderBy(asc(plotBlocks.act), asc(plotBlocks.sortOrder)),
  ]);
  const allItems = publishCanon
    ? itemRows.filter((item) => matchesCurrentCanon(item.meta, canonBinding))
    : itemRows;
  const allBlocks = publishCanon
    ? blockRows.filter((item) => matchesCurrentCanon(item.meta, canonBinding))
    : blockRows;
  if (publishCanon) {
    const expectedItemKeys = new Set([
      "plot",
      ...canonPackage.workspaceProjection.characters.map((item) => `character:${item.entityKey}`),
      ...canonPackage.storyyardProjection.arcs.map((item) => `arc:${item.bId}`),
    ]);
    const expectedBlockKeys = new Set(
      canonPackage.storyyardProjection.episodeBlocks.map((item) => `episode:${item.episode}`),
    );
    const actualItemKeys = new Set(allItems.flatMap((item) => {
      const identity = readFoundryIdentity(item.meta);
      return identity ? [identity.entityKey] : [];
    }));
    const actualBlockKeys = new Set(allBlocks.flatMap((item) => {
      const identity = readFoundryIdentity(item.meta);
      return identity ? [identity.entityKey] : [];
    }));
    if (
      expectedItemKeys.size !== actualItemKeys.size
      || expectedBlockKeys.size !== actualBlockKeys.size
      || [...expectedItemKeys].some((key) => !actualItemKeys.has(key))
      || [...expectedBlockKeys].some((key) => !actualBlockKeys.has(key))
    ) {
      return Response.json({
        error: "현재 정본 인물·아크·회차 블록 집합이 완전하지 않아 공개를 중단했음.",
      }, { status: 409 });
    }
  }
  const itemById = new Map(allItems.map((item) => [item.id, item]));
  const blockById = new Map(allBlocks.map((block) => [block.id, block]));
  const requested = {
    characterIds: publishAll ? allItems.filter((item) => item.kind === "character").map((item) => item.id) : uniqueStrings(input.characterIds),
    documentIds: publishAll ? allItems.filter((item) => item.kind === "document").map((item) => item.id) : uniqueStrings(input.documentIds),
    plotIds: publishAll ? allItems.filter((item) => item.kind === "plot").map((item) => item.id) : uniqueStrings(input.plotIds),
    actIds: publishAll ? allItems.filter((item) => item.kind === "act").map((item) => item.id) : uniqueStrings(input.actIds),
    blockIds: publishAll ? allBlocks.map((item) => item.id) : uniqueStrings(input.blockIds),
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
  if (!(await consumeHumanActionGrant(user.id, projectId, "publication.write", input.humanActionToken))) {
    return Response.json({
      error: "공개 직전에 인간 관리자 비밀번호 확인이 필요함.",
      humanActionRequired: "publication.write",
    }, { status: 428 });
  }
  const [existing] = await db.select().from(publications).where(eq(publications.projectId, projectId));
  const timestamp = new Date().toISOString();
  const publicationId = existing?.id ?? crypto.randomUUID();
  const cover = getCoverOption(project.coverKey);
  const publication = {
    id: publicationId,
    projectId,
    ownerUserId: user.id,
    slug: existing?.slug ?? `work-${publicationId.slice(0, 8)}`,
    // 작품 기본 정보는 작업실 원본이 항상 공개본보다 우선한다.
    title: project.title,
    logline: project.logline,
    genre: project.genre,
    coverKey: cover.key,
    coverUrl: cover.src,
    authorName: input.authorName?.trim() || user.displayName,
    status: "published",
    publishedRevision: project.contentRevision,
    publishedAt: existing?.publishedAt ?? timestamp,
    updatedAt: timestamp,
  };

  const batch = [
    existing
      ? env.DB.prepare(
        `UPDATE publications
            SET owner_user_id = ?, title = ?, logline = ?, genre = ?, cover_key = ?,
                cover_url = ?, author_name = ?, status = 'published',
                published_revision = ?, updated_at = ?
          WHERE id = ?`,
      ).bind(
        user.id, publication.title, publication.logline, publication.genre,
        publication.coverKey, publication.coverUrl, publication.authorName,
        publication.publishedRevision, timestamp, publicationId,
      )
      : env.DB.prepare(
        `INSERT INTO publications
          (id, project_id, owner_user_id, slug, title, logline, genre, cover_key,
           cover_url, author_name, status, published_revision, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
      ).bind(
        publicationId, projectId, user.id, publication.slug, publication.title,
        publication.logline, publication.genre, publication.coverKey,
        publication.coverUrl, publication.authorName, publication.publishedRevision,
        publication.publishedAt, timestamp,
      ),
    env.DB.prepare("DELETE FROM publication_episodes WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM publication_content WHERE publication_id = ?").bind(publicationId),
    ...selected.map((item) =>
      env.DB.prepare(
        `INSERT INTO publication_episodes
          (id, publication_id, source_manuscript_id, episode_no, title, body, meta, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
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
      includeAllCharacterFields: publishAll,
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
    env.DB.prepare("UPDATE manuscripts SET status = 'draft' WHERE project_id = ?").bind(projectId),
    env.DB.prepare(
      `UPDATE manuscripts SET status = 'published'
        WHERE id IN (${episodeIds.map(() => "?").join(", ")})`,
    ).bind(...episodeIds),
  ];
  await env.DB.batch(batch);
  return Response.json({ publication, revision: timestamp, updatedAt: timestamp });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin") {
    return Response.json({ error: "공개 중지는 인간 관리자 확인이 필요함." }, { status: 403 });
  }
  const input = await request.json().catch(() => null) as { humanActionToken?: unknown } | null;
  if (!(await consumeHumanActionGrant(user.id, id, "publication.delete", input?.humanActionToken))) {
    return Response.json({
      error: "공개 중지 직전에 인간 관리자 비밀번호 확인이 필요함.",
      humanActionRequired: "publication.delete",
    }, { status: 428 });
  }
  const timestamp = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE publications SET status = 'draft', updated_at = ? WHERE project_id = ?",
  ).bind(timestamp, id).run();
  if (!result.success) {
    return Response.json({ error: "공개를 중지하지 못했음." }, { status: 500 });
  }
  return Response.json({ ok: true, revision: timestamp, updatedAt: timestamp });
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

function readMeta(value: string): { plotId: string; act: number; status: string; tags: string[]; fields: Array<{ id: string; label: string; value: string }> } {
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
      status: typeof parsed.status === "string"
        ? parsed.status
        : parsed.foundrySync && typeof parsed.foundrySync === "object" && typeof (parsed.foundrySync as Record<string, unknown>).status === "string"
          ? String((parsed.foundrySync as Record<string, unknown>).status)
          : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string") : [],
      fields,
    };
  } catch {
    return { plotId: "", act: 0, status: "", tags: [], fields: [] };
  }
}

function readFoundryIdentity(value: string): {
  workSlug: string;
  sourceCommit: string;
  entityKey: string;
} | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const foundrySync = parsed.foundrySync;
    if (!foundrySync || typeof foundrySync !== "object") return null;
    const record = foundrySync as Record<string, unknown>;
    return typeof record.workSlug === "string"
      && typeof record.sourceCommit === "string"
      && typeof record.entityKey === "string"
      ? {
        workSlug: record.workSlug,
        sourceCommit: record.sourceCommit,
        entityKey: record.entityKey,
      }
      : null;
  } catch {
    return null;
  }
}

function matchesCurrentCanon(
  value: string,
  binding: { workSlug: string; sourceCommit: string },
) {
  const identity = readFoundryIdentity(value);
  return identity?.workSlug === binding.workSlug
    && identity.sourceCommit === binding.sourceCommit;
}

function buildContentSnapshots({
  allItems,
  allBlocks,
  requested,
  characterFieldIds,
  includeAllCharacterFields,
}: {
  allItems: Array<{ id: string; kind: string; title: string; body: string; meta: string }>;
  allBlocks: Array<{ id: string; act: number; title: string; body: string; meta: string; sortOrder: number }>;
  requested: { characterIds: string[]; documentIds: string[]; plotIds: string[]; actIds: string[]; blockIds: string[] };
  characterFieldIds: Record<string, string[]>;
  includeAllCharacterFields: boolean;
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
    const selectedFields = new Set(includeAllCharacterFields ? meta.fields.map((field) => field.id) : uniqueStrings(characterFieldIds[id]));
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
    result.push({ sourceId: item.id, kind: "act", parentSourceId: meta.plotId, sortOrder: meta.act || index + 1, title: item.title, body: item.body, meta: JSON.stringify({ act: meta.act || index + 1, status: meta.status }) });
  });
  requested.blockIds.forEach((id, index) => {
    const block = allBlocks.find((item) => item.id === id)!;
    const meta = readMeta(block.meta);
    result.push({ sourceId: block.id, kind: "block", parentSourceId: meta.plotId, sortOrder: block.sortOrder || index, title: block.title, body: block.body, meta: JSON.stringify({ act: block.act, status: meta.status }) });
  });
  return result;
}
