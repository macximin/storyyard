import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getCanonPackage, listCanonPackages } from "@/app/canon-packages";
import { getDb } from "@/db";
import { plotBlocks, projectItems, projects } from "@/db/schema";

type JsonObject = Record<string, unknown>;
type FoundrySyncMeta = {
  mappingVersion: string;
  workSlug: string;
  entityKey: string;
  sourceCommit: string;
  sourceSha256: string;
  projectedContentSha256: string;
  authority: string;
  status: string;
  reverseSync: false;
};

function readObject(value: string): JsonObject {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as JsonObject : {};
  } catch {
    return {};
  }
}

function readFoundrySync(value: string): FoundrySyncMeta | null {
  const candidate = readObject(value).foundrySync;
  if (!candidate || typeof candidate !== "object") return null;
  const meta = candidate as Partial<FoundrySyncMeta>;
  return typeof meta.workSlug === "string"
    && typeof meta.entityKey === "string"
    && typeof meta.projectedContentSha256 === "string"
    ? meta as FoundrySyncMeta
    : null;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function syncMeta(
  base: JsonObject,
  input: Omit<FoundrySyncMeta, "projectedContentSha256"> & { projectedContentSha256: string },
) {
  return JSON.stringify({ ...base, foundrySync: input });
}

async function requireAdminOwner(projectId: string) {
  const user = await getChatGPTUser();
  if (!user || user.role !== "admin") return { error: "관리자 권한이 필요함.", status: 403 } as const;
  const [project] = await getDb().select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerEmail, user.email)));
  if (!project) return { error: "작품을 찾을 수 없음.", status: 404 } as const;
  return { user, project } as const;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params;
  const access = await requireAdminOwner(projectId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const items = await getDb().select().from(projectItems).where(eq(projectItems.projectId, projectId));
  const syncedPlots = items.flatMap((item) => {
    if (item.kind !== "plot") return [];
    const sync = readFoundrySync(item.meta);
    return sync?.entityKey === "plot"
      ? [{ plotId: item.id, workSlug: sync.workSlug, sourceCommit: sync.sourceCommit }]
      : [];
  });
  return Response.json({
    packages: listCanonPackages().map((canonPackage) => ({
      workSlug: canonPackage.workSlug,
      title: canonPackage.title,
      sourceCommit: canonPackage.sourceGitCommit,
      bundleSha256: canonPackage.bundleSha256,
      currentEpisode: canonPackage.status.currentEpisode,
      currentBArc: canonPackage.status.currentBArc,
    })),
    syncedPlots,
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params;
  const access = await requireAdminOwner(projectId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const input = await request.json().catch(() => null) as { workSlug?: string } | null;
  const canonPackage = getCanonPackage(input?.workSlug?.trim() ?? "");
  if (!canonPackage) return Response.json({ error: "등록되지 않은 캐논 패키지임." }, { status: 404 });
  if (
    canonPackage.storyyardProjection.mappingVersion !== "foundry_storyyard_arc_episode_v1"
    || canonPackage.storyyardProjection.blockUnit !== "episode"
  ) {
    return Response.json({ error: "Storyyard 아크·화 투영 계약과 맞지 않음." }, { status: 409 });
  }

  const db = getDb();
  const [existingItems, existingBlocks] = await Promise.all([
    db.select().from(projectItems).where(eq(projectItems.projectId, projectId)),
    db.select().from(plotBlocks).where(eq(plotBlocks.projectId, projectId)),
  ]);
  const timestamp = new Date().toISOString();
  const plotEntity = existingItems.find((item) => {
    const sync = readFoundrySync(item.meta);
    return item.kind === "plot"
      && sync?.workSlug === canonPackage.workSlug
      && sync.entityKey === "plot";
  });
  const plotId = plotEntity?.id ?? crypto.randomUUID();
  const plotMetaBase = plotEntity ? readObject(plotEntity.meta) : {
    isDefault: false,
    sortOrder: Date.now(),
  };
  const plotMeta = syncMeta(plotMetaBase, {
    mappingVersion: canonPackage.storyyardProjection.mappingVersion,
    workSlug: canonPackage.workSlug,
    entityKey: "plot",
    sourceCommit: canonPackage.sourceGitCommit,
    sourceSha256: canonPackage.bundleSha256,
    projectedContentSha256: "",
    authority: "owner_approved_projection",
    status: "active",
    reverseSync: false,
  });
  if (plotEntity) {
    await db.update(projectItems).set({ meta: plotMeta, updatedAt: timestamp })
      .where(eq(projectItems.id, plotEntity.id));
  } else {
    await db.insert(projectItems).values({
      id: plotId,
      projectId,
      kind: "plot",
      title: `Foundry · ${canonPackage.title}`,
      body: `B-Rail을 아크로, 한 화를 블록 하나로 비추는 읽기 투영 · source ${canonPackage.sourceGitCommit.slice(0, 12)}`,
      meta: plotMeta,
      updatedAt: timestamp,
    });
  }

  const report = {
    plotId,
    created: 0,
    updated: 0,
    unchanged: 0,
    conflicts: [] as Array<{ entityKey: string; title: string }>,
    retained: 0,
  };
  const actByBId = new Map<string, number>();
  const projectedKeys = new Set<string>();

  for (const [index, arc] of canonPackage.storyyardProjection.arcs.entries()) {
    const act = index + 1;
    const entityKey = `arc:${arc.bId}`;
    projectedKeys.add(entityKey);
    actByBId.set(arc.bId, act);
    const desired = { title: arc.title, body: arc.body, act };
    const desiredHash = await sha256(desired);
    const existing = existingItems.find((item) => {
      const sync = readFoundrySync(item.meta);
      return item.kind === "act"
        && sync?.workSlug === canonPackage.workSlug
        && sync.entityKey === entityKey;
    });
    const previousSync = existing ? readFoundrySync(existing.meta) : null;
    const currentHash = existing
      ? await sha256({ title: existing.title, body: existing.body, act: Number(readObject(existing.meta).act ?? 0) })
      : "";
    if (existing && previousSync && currentHash !== previousSync.projectedContentSha256) {
      report.conflicts.push({ entityKey, title: existing.title });
      continue;
    }
    const meta = syncMeta(
      { ...(existing ? readObject(existing.meta) : {}), act, plotId },
      {
        mappingVersion: canonPackage.storyyardProjection.mappingVersion,
        workSlug: canonPackage.workSlug,
        entityKey,
        sourceCommit: canonPackage.sourceGitCommit,
        sourceSha256: arc.sourceSha256,
        projectedContentSha256: desiredHash,
        authority: "owner_approved_story_plan",
        status: arc.status,
        reverseSync: false,
      },
    );
    if (!existing) {
      await db.insert(projectItems).values({
        id: crypto.randomUUID(),
        projectId,
        kind: "act",
        title: arc.title,
        body: arc.body,
        meta,
        updatedAt: timestamp,
      });
      report.created += 1;
    } else if (
      currentHash === desiredHash
      && previousSync?.sourceSha256 === arc.sourceSha256
      && previousSync.sourceCommit === canonPackage.sourceGitCommit
    ) {
      report.unchanged += 1;
    } else {
      await db.update(projectItems).set({ title: arc.title, body: arc.body, meta, updatedAt: timestamp })
        .where(eq(projectItems.id, existing.id));
      report.updated += 1;
    }
  }

  for (const episode of canonPackage.storyyardProjection.episodeBlocks) {
    const act = actByBId.get(episode.bId);
    if (!act) {
      return Response.json({ error: `${episode.episode}의 B-Rail 아크가 투영 범위에 없음.` }, { status: 409 });
    }
    const entityKey = `episode:${episode.episode}`;
    projectedKeys.add(entityKey);
    const desired = { title: episode.title, body: episode.body, act };
    const desiredHash = await sha256(desired);
    const existing = existingBlocks.find((block) => {
      const sync = readFoundrySync(block.meta);
      return sync?.workSlug === canonPackage.workSlug && sync.entityKey === entityKey;
    });
    const previousSync = existing ? readFoundrySync(existing.meta) : null;
    const currentHash = existing
      ? await sha256({ title: existing.title, body: existing.body, act: existing.act })
      : "";
    if (existing && previousSync && currentHash !== previousSync.projectedContentSha256) {
      report.conflicts.push({ entityKey, title: existing.title });
      continue;
    }
    const baseMeta = existing ? readObject(existing.meta) : {};
    const meta = syncMeta(
      {
        ...baseMeta,
        plotId,
        characterIds: Array.isArray(baseMeta.characterIds) ? baseMeta.characterIds : [],
        documentIds: Array.isArray(baseMeta.documentIds) ? baseMeta.documentIds : [],
      },
      {
        mappingVersion: canonPackage.storyyardProjection.mappingVersion,
        workSlug: canonPackage.workSlug,
        entityKey,
        sourceCommit: canonPackage.sourceGitCommit,
        sourceSha256: episode.sourceSha256,
        projectedContentSha256: desiredHash,
        authority: episode.authority,
        status: episode.status,
        reverseSync: false,
      },
    );
    if (!existing) {
      await db.insert(plotBlocks).values({
        id: crypto.randomUUID(),
        projectId,
        act,
        kind: "episode",
        title: episode.title,
        body: episode.body,
        meta,
        sortOrder: episode.sortOrder,
        updatedAt: timestamp,
      });
      report.created += 1;
    } else if (
      currentHash === desiredHash
      && previousSync?.sourceSha256 === episode.sourceSha256
      && previousSync.sourceCommit === canonPackage.sourceGitCommit
    ) {
      report.unchanged += 1;
    } else {
      await db.update(plotBlocks).set({
        act,
        kind: "episode",
        title: episode.title,
        body: episode.body,
        meta,
        sortOrder: episode.sortOrder,
        updatedAt: timestamp,
      }).where(eq(plotBlocks.id, existing.id));
      report.updated += 1;
    }
  }

  report.retained = [
    ...existingItems.filter((item) => ["act"].includes(item.kind)),
    ...existingBlocks,
  ].filter((entity) => {
    const sync = readFoundrySync(entity.meta);
    return sync?.workSlug === canonPackage.workSlug && !projectedKeys.has(sync.entityKey);
  }).length;
  await db.update(projects).set({ updatedAt: timestamp }).where(eq(projects.id, projectId));

  return Response.json({
    report,
    source: {
      workSlug: canonPackage.workSlug,
      commit: canonPackage.sourceGitCommit,
      bundleSha256: canonPackage.bundleSha256,
    },
  });
}
