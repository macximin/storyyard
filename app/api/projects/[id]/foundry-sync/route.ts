import { env } from "cloudflare:workers";
import { getSessionTokenHash } from "@/app/chatgpt-auth";
import { getSyncableCanonPackage, listSyncableCanonPackages } from "@/app/canon-packages";
import { executeFoundryWrites } from "@/app/foundry-sync-write-policy.mjs";
import { plotBlocks, projectItems } from "@/db/schema";

type JsonObject = Record<string, unknown>;
type ProjectItemRow = typeof projectItems.$inferSelect;
type PlotBlockRow = typeof plotBlocks.$inferSelect;
type ProjectRow = { id: string; title: string; logline: string; genre: string };
type ManuscriptRow = {
  id: string; projectId: string; episodeNo: number; title: string; body: string;
  status: string; meta: string; createdAt: string; updatedAt: string;
};
type CanonBindingRow = {
  projectId: string;
  workSlug: string;
  sourceCommit: string;
  bundleSha256: string;
  revisionSetSha256: string;
};
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

function normalizedTitle(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");
}

async function loadAdminOwnerState(projectId: string) {
  const tokenHash = await getSessionTokenHash();
  if (!tokenHash) return { error: "관리자 권한이 필요함.", status: 403 } as const;
  const now = new Date().toISOString();
  const [userResult, projectResult, itemsResult, blocksResult, manuscriptsResult, bindingResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        LIMIT 1`,
    ).bind(tokenHash, now),
    env.DB.prepare(
      `SELECT p.id, p.title, p.logline, p.genre
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
    env.DB.prepare(
      `SELECT m.id, m.project_id AS "projectId", m.episode_no AS "episodeNo",
              m.title, m.body, m.status, m.meta, m.created_at AS "createdAt",
              m.updated_at AS "updatedAt"
         FROM manuscripts m
        WHERE m.project_id = ?`,
    ).bind(projectId),
    env.DB.prepare(
      `SELECT project_id AS "projectId", work_slug AS "workSlug",
              source_commit AS "sourceCommit", bundle_sha256 AS "bundleSha256",
              revision_set_sha256 AS "revisionSetSha256"
         FROM canon_bindings
        WHERE project_id = ?
        LIMIT 1`,
    ).bind(projectId),
  ]);
  const user = userResult.results?.[0] as { id: string; role: string } | undefined;
  if (!user || user.role !== "admin") {
    return { error: "관리자 권한이 필요함.", status: 403 } as const;
  }
  if (!projectResult.results?.length) {
    return { error: "작품을 찾을 수 없음.", status: 404 } as const;
  }
  return {
    project: projectResult.results[0] as ProjectRow,
    items: (itemsResult.results ?? []) as ProjectItemRow[],
    blocks: (blocksResult.results ?? []) as PlotBlockRow[],
    manuscripts: (manuscriptsResult.results ?? []) as ManuscriptRow[],
    binding: bindingResult.results?.[0] as CanonBindingRow | undefined,
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
  if ("error" in access) {
    return Response.json({
      error: access.error,
      publicationMutated: false,
    }, { status: access.status });
  }

  const input = await request.json().catch(() => null) as {
    workSlug?: string;
    repairLegacySnapshot?: boolean;
    dryRun?: boolean;
  } | null;
  const dryRun = input?.dryRun === true;
  const canonPackage = getSyncableCanonPackage(input?.workSlug?.trim() ?? "");
  if (!canonPackage) {
    return Response.json({
      error: "커밋된 정본만 Storyyard 플롯으로 동기화할 수 있음.",
      dryRun,
      publicationMutated: false,
    }, { status: 409 });
  }
  if (
    !["foundry_storyyard_arc_episode_v1", "foundry_storyyard_arc_episode_v2"].includes(
      canonPackage.storyyardProjection.mappingVersion,
    )
    || canonPackage.storyyardProjection.arcUnit !== "b_rail_arc"
    || canonPackage.storyyardProjection.blockUnit !== "episode"
    || canonPackage.storyyardProjection.reverseSync !== false
    || canonPackage.workspaceProjection.mappingVersion !== "foundry_storyyard_workspace_v1"
    || canonPackage.workspaceProjection.reverseSync !== false
    || canonPackage.workspaceProjection.revisionSetSha256 !== canonPackage.revisionSetSha256
  ) {
    return Response.json({
      error: "Storyyard 전체 정본 투영 계약과 맞지 않음.",
      dryRun,
      publicationMutated: false,
    }, { status: 409 });
  }
  if (access.binding && access.binding.workSlug !== canonPackage.workSlug) {
    return Response.json({
      error: `이 프로젝트는 이미 ${access.binding.workSlug} 정본에 연결되어 있어 다른 작품으로 다시 연결할 수 없음.`,
      dryRun,
      publicationMutated: false,
    }, { status: 409 });
  }
  if (
    !access.binding
    && normalizedTitle(access.project.title) !== normalizedTitle(canonPackage.workspaceProjection.overview.title)
  ) {
    return Response.json({
      error: "최초 정본 연결은 Storyyard 프로젝트 제목과 Foundry 작품 제목이 일치해야 함.",
      dryRun,
      publicationMutated: false,
    }, { status: 409 });
  }
  if (input?.repairLegacySnapshot === true) {
    return Response.json({
      error: "기존 무표식 원고 복구는 자동 동기화에서 수행하지 않음. 인간 검토가 있는 별도 마이그레이션이 필요함.",
      dryRun,
      publicationMutated: false,
    }, { status: 409 });
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
    workspace: {
      overview: 0,
      characters: 0,
      manuscripts: 0,
    },
    overviewPreserved: true,
  };
  const workspaceMappingVersion = canonPackage.workspaceProjection.mappingVersion;

  for (const character of canonPackage.workspaceProjection.characters) {
    const entityKey = `character:${character.entityKey}`;
    const existing = existingItems.find((item) => {
      const sync = readFoundrySync(item.meta);
      return item.kind === "character"
        && sync?.workSlug === canonPackage.workSlug
        && sync.entityKey === entityKey;
    });
    const desired = { title: character.title, body: character.body };
    const desiredHash = await sha256(desired);
    const previousSync = existing ? readFoundrySync(existing.meta) : null;
    const currentHash = existing ? await sha256({ title: existing.title, body: existing.body }) : "";
    if (existing && previousSync && currentHash !== previousSync.projectedContentSha256) {
      report.conflicts.push({ entityKey, title: existing.title });
      continue;
    }
    const id = existing?.id ?? crypto.randomUUID();
    const meta = syncMeta({
      ...(existing ? readObject(existing.meta) : {}),
      tags: character.tags,
      pinned: false,
      avatar: "",
      fields: character.fields,
      sortOrder: character.sortOrder,
    }, {
      mappingVersion: workspaceMappingVersion,
      workSlug: canonPackage.workSlug,
      entityKey,
      sourceCommit: canonPackage.sourceGitCommit,
      sourceSha256: character.sourceSha256,
      projectedContentSha256: desiredHash,
      authority: "derived_narrative_state_projection",
      status: "active",
      reverseSync: false,
    });
    if (!existing) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO project_items
            (id, project_id, kind, title, body, meta, updated_at)
           VALUES (?, ?, 'character', ?, ?, ?, ?)`,
        ).bind(id, projectId, character.title, character.body, meta, timestamp),
      );
      report.workspace.characters += 1;
    } else if (
      currentHash !== desiredHash
      || previousSync.sourceSha256 !== character.sourceSha256
      || previousSync.sourceCommit !== canonPackage.sourceGitCommit
    ) {
      writes.push(
        env.DB.prepare(
          `UPDATE project_items SET title = ?, body = ?, meta = ?, updated_at = ? WHERE id = ?`,
        ).bind(character.title, character.body, meta, timestamp, id),
      );
      report.workspace.characters += 1;
    }
  }

  for (const manuscript of canonPackage.workspaceProjection.manuscripts) {
    const entityKey = `manuscript:${manuscript.entityKey}`;
    const existing = access.manuscripts.find((item) => item.episodeNo === manuscript.episodeNo);
    const desired = { title: manuscript.title, body: manuscript.body };
    const desiredHash = await sha256(desired);
    const previousSync = existing ? readFoundrySync(existing.meta) : null;
    const currentHash = existing ? await sha256({ title: existing.title, body: existing.body }) : "";
    if (
      existing
      && ((previousSync && currentHash !== previousSync.projectedContentSha256)
        || (!previousSync && Boolean(existing.body.trim()) && currentHash !== desiredHash))
    ) {
      report.conflicts.push({ entityKey, title: existing.title });
      continue;
    }
    const id = existing?.id ?? crypto.randomUUID();
    const meta = syncMeta(existing ? readObject(existing.meta) : {}, {
      mappingVersion: workspaceMappingVersion,
      workSlug: canonPackage.workSlug,
      entityKey,
      sourceCommit: canonPackage.sourceGitCommit,
      sourceSha256: manuscript.sourceSha256,
      projectedContentSha256: desiredHash,
      authority: "owner_approved_manuscript",
      status: "committed",
      reverseSync: false,
    });
    if (!existing) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO manuscripts
            (id, project_id, episode_no, title, body, status, meta, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
        ).bind(id, projectId, manuscript.episodeNo, manuscript.title, manuscript.body, meta, timestamp, timestamp),
      );
      report.workspace.manuscripts += 1;
    } else if (
      currentHash !== desiredHash
      || previousSync?.sourceSha256 !== manuscript.sourceSha256
      || previousSync?.sourceCommit !== canonPackage.sourceGitCommit
      || existing.status !== "published"
    ) {
      writes.push(
        env.DB.prepare(
          `UPDATE manuscripts
              SET title = ?, body = ?, status = 'published', meta = ?, updated_at = ?
            WHERE id = ?`,
        ).bind(manuscript.title, manuscript.body, meta, timestamp, id),
      );
      report.workspace.manuscripts += 1;
    }
  }

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
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO project_items
            (id, project_id, kind, title, body, meta, updated_at)
           VALUES (?, ?, 'act', ?, ?, ?, ?)`,
        ).bind(id, projectId, arc.title, arc.body, meta, timestamp),
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
      return Response.json({
        error: `${episode.episode}의 B-Rail 아크가 투영 범위에 없음.`,
        dryRun,
        publicationMutated: false,
      }, { status: 409 });
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
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO plot_blocks
            (id, project_id, act, kind, title, body, meta, sort_order, updated_at)
           VALUES (?, ?, ?, 'episode', ?, ?, ?, ?, ?)`,
        ).bind(
          id,
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
  if (report.conflicts.length) {
    return Response.json({
      error: "Storyyard에서 수정된 정본 투영이 있어 전체 동기화를 쓰기 없이 중단했음. 인간 검토로 충돌을 먼저 해결해 줘.",
      report,
      dryRun,
      publicationMutated: false,
      plannedWrites: writes.length,
    }, { status: 409 });
  }
  const contentWriteCount = writes.length;
  const bindingNeedsUpdate = !access.binding
    || access.binding.sourceCommit !== canonPackage.sourceGitCommit
    || access.binding.bundleSha256 !== canonPackage.bundleSha256
    || access.binding.revisionSetSha256 !== canonPackage.revisionSetSha256;
  if (contentWriteCount > 0 || bindingNeedsUpdate) {
    writes.push(
      env.DB.prepare(
        `INSERT INTO canon_bindings
          (project_id, work_slug, source_commit, bundle_sha256, revision_set_sha256, synced_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           source_commit = excluded.source_commit,
           bundle_sha256 = excluded.bundle_sha256,
           revision_set_sha256 = excluded.revision_set_sha256,
           synced_at = excluded.synced_at
         WHERE canon_bindings.work_slug = excluded.work_slug`,
      ).bind(
        projectId,
        canonPackage.workSlug,
        canonPackage.sourceGitCommit,
        canonPackage.bundleSha256,
        canonPackage.revisionSetSha256,
        timestamp,
      ),
    );
  }
  if (contentWriteCount > 0) {
    writes.push(
      env.DB.prepare(`UPDATE projects SET content_revision = ?, updated_at = ? WHERE id = ?`)
        .bind(timestamp, timestamp, projectId),
    );
  }
  const plannedWrites = writes.length;
  await executeFoundryWrites(env.DB, writes, { dryRun });

  return Response.json({
    report,
    dryRun,
    publicationMutated: false,
    plannedWrites,
    revision: dryRun ? null : timestamp,
    updatedAt: dryRun ? null : timestamp,
    source: {
      workSlug: canonPackage.workSlug,
      commit: canonPackage.sourceGitCommit,
      bundleSha256: canonPackage.bundleSha256,
    },
  });
}
