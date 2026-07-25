import { env } from "cloudflare:workers";
import { getSessionTokenHash } from "@/app/chatgpt-auth";
import { getSyncableCanonPackage, listSyncableCanonPackages } from "@/app/canon-packages";
import { plotBlocks, projectItems } from "@/db/schema";

type JsonObject = Record<string, unknown>;
type ProjectItemRow = typeof projectItems.$inferSelect;
type PlotBlockRow = typeof plotBlocks.$inferSelect;
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

async function loadAdminOwnerState(projectId: string) {
  const tokenHash = await getSessionTokenHash();
  if (!tokenHash) return { error: "관리자 권한이 필요함.", status: 403 } as const;
  const now = new Date().toISOString();
  const [userResult, projectResult, itemsResult, blocksResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        LIMIT 1`,
    ).bind(tokenHash, now),
    env.DB.prepare(
      `SELECT p.id
         FROM projects p
         JOIN users u ON u.owner_key = p.owner_email
         JOIN sessions s ON s.user_id = u.id
        WHERE p.id = ? AND s.token_hash = ? AND s.expires_at > ? AND u.role = 'admin'
        LIMIT 1`,
    ).bind(projectId, tokenHash, now),
    env.DB.prepare(
      `SELECT pi.id, pi.project_id AS "projectId", pi.kind, pi.title, pi.body,
              pi.meta, pi.updated_at AS "updatedAt"
         FROM project_items pi
         JOIN projects p ON p.id = pi.project_id
         JOIN users u ON u.owner_key = p.owner_email
         JOIN sessions s ON s.user_id = u.id
        WHERE pi.project_id = ?
          AND s.token_hash = ?
          AND s.expires_at > ?
          AND u.role = 'admin'`,
    ).bind(projectId, tokenHash, now),
    env.DB.prepare(
      `SELECT pb.id, pb.project_id AS "projectId", pb.act, pb.kind, pb.title,
              pb.body, pb.meta, pb.sort_order AS "sortOrder",
              pb.updated_at AS "updatedAt"
         FROM plot_blocks pb
         JOIN projects p ON p.id = pb.project_id
         JOIN users u ON u.owner_key = p.owner_email
         JOIN sessions s ON s.user_id = u.id
        WHERE pb.project_id = ?
          AND s.token_hash = ?
          AND s.expires_at > ?
          AND u.role = 'admin'`,
    ).bind(projectId, tokenHash, now),
  ]);
  const user = userResult.results?.[0] as { id: string; role: string } | undefined;
  if (!user || user.role !== "admin") {
    return { error: "관리자 권한이 필요함.", status: 403 } as const;
  }
  if (!projectResult.results?.length) {
    return { error: "작품을 찾을 수 없음.", status: 404 } as const;
  }
  return {
    items: (itemsResult.results ?? []) as ProjectItemRow[],
    blocks: (blocksResult.results ?? []) as PlotBlockRow[],
  } as const;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await context.params;
  const access = await loadAdminOwnerState(projectId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const syncedPlots = access.items.flatMap((item) => {
    if (item.kind !== "plot") return [];
    const sync = readFoundrySync(item.meta);
    return sync?.entityKey === "plot"
      ? [{ plotId: item.id, workSlug: sync.workSlug, sourceCommit: sync.sourceCommit }]
      : [];
  });
  return Response.json({
    packages: listSyncableCanonPackages().map((canonPackage) => ({
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
  const access = await loadAdminOwnerState(projectId);
  if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

  const input = await request.json().catch(() => null) as { workSlug?: string } | null;
  const canonPackage = getSyncableCanonPackage(input?.workSlug?.trim() ?? "");
  if (!canonPackage) return Response.json({ error: "커밋된 정본만 Storyyard 플롯으로 동기화할 수 있음." }, { status: 409 });
  if (
    canonPackage.storyyardProjection.mappingVersion !== "foundry_storyyard_arc_episode_v1"
    || canonPackage.storyyardProjection.blockUnit !== "episode"
  ) {
    return Response.json({ error: "Storyyard 아크·화 투영 계약과 맞지 않음." }, { status: 409 });
  }

  const existingItems = access.items;
  const existingBlocks = access.blocks;
  const writes: ReturnType<typeof env.DB.prepare>[] = [];
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
    if (plotEntity.meta !== plotMeta) {
      writes.push(
        env.DB.prepare(
          `UPDATE project_items SET meta = ?, updated_at = ? WHERE id = ?`,
        ).bind(plotMeta, timestamp, plotEntity.id),
      );
    }
  } else {
    writes.push(
      env.DB.prepare(
        `INSERT INTO project_items
          (id, project_id, kind, title, body, meta, updated_at)
         VALUES (?, ?, 'plot', ?, ?, ?, ?)`,
      ).bind(
        plotId,
        projectId,
        `Foundry · ${canonPackage.title}`,
        `B-Rail을 아크로, 한 화를 블록 하나로 비추는 읽기 투영 · source ${canonPackage.sourceGitCommit.slice(0, 12)}`,
        plotMeta,
        timestamp,
      ),
    );
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
      writes.push(
        env.DB.prepare(
          `INSERT INTO project_items
            (id, project_id, kind, title, body, meta, updated_at)
           VALUES (?, ?, 'act', ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), projectId, arc.title, arc.body, meta, timestamp),
      );
      report.created += 1;
    } else if (
      currentHash === desiredHash
      && previousSync?.sourceSha256 === arc.sourceSha256
      && previousSync.sourceCommit === canonPackage.sourceGitCommit
    ) {
      report.unchanged += 1;
    } else {
      writes.push(
        env.DB.prepare(
          `UPDATE project_items
              SET title = ?, body = ?, meta = ?, updated_at = ?
            WHERE id = ?`,
        ).bind(arc.title, arc.body, meta, timestamp, existing.id),
      );
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
      writes.push(
        env.DB.prepare(
          `INSERT INTO plot_blocks
            (id, project_id, act, kind, title, body, meta, sort_order, updated_at)
           VALUES (?, ?, ?, 'episode', ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          projectId,
          act,
          episode.title,
          episode.body,
          meta,
          episode.sortOrder,
          timestamp,
        ),
      );
      report.created += 1;
    } else if (
      currentHash === desiredHash
      && previousSync?.sourceSha256 === episode.sourceSha256
      && previousSync.sourceCommit === canonPackage.sourceGitCommit
    ) {
      report.unchanged += 1;
    } else {
      writes.push(
        env.DB.prepare(
          `UPDATE plot_blocks
              SET act = ?, kind = 'episode', title = ?, body = ?, meta = ?,
                  sort_order = ?, updated_at = ?
            WHERE id = ?`,
        ).bind(
          act,
          episode.title,
          episode.body,
          meta,
          episode.sortOrder,
          timestamp,
          existing.id,
        ),
      );
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
  if (writes.length) {
    writes.push(
      env.DB.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`)
        .bind(timestamp, projectId),
    );
    await env.DB.batch(writes);
  }

  return Response.json({
    report,
    source: {
      workSlug: canonPackage.workSlug,
      commit: canonPackage.sourceGitCommit,
      bundleSha256: canonPackage.bundleSha256,
    },
  });
}
