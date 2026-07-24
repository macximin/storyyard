import { env } from "cloudflare:workers";

export type WorkspaceSnapshot = {
  project: {
    id: string;
    title: string;
    logline: string;
    genre: string;
    favorite: number;
    updatedAt: string;
  };
  blocks: Array<{
    id: string;
    act: number;
    kind: string;
    title: string;
    body: string;
    meta: string;
    sortOrder: number;
  }>;
  items: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    meta: string;
    updatedAt: string;
  }>;
};

export async function getOwnedWorkspace(
  projectId: string,
  ownerKey: string,
): Promise<WorkspaceSnapshot | null> {
  const [projectResult, blocksResult, itemsResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, title, logline, genre, favorite, updated_at AS "updatedAt"
         FROM projects
        WHERE id = ? AND owner_email = ?`,
    ).bind(projectId, ownerKey),
    env.DB.prepare(
      `SELECT id, act, kind, title, body, meta, sort_order AS "sortOrder"
         FROM plot_blocks
        WHERE project_id = ?
          AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_email = ?)
        ORDER BY act ASC, sort_order ASC`,
    ).bind(projectId, projectId, ownerKey),
    env.DB.prepare(
      `SELECT id, kind, title, body, meta, updated_at AS "updatedAt"
         FROM project_items
        WHERE project_id = ?
          AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_email = ?)
        ORDER BY updated_at ASC`,
    ).bind(projectId, projectId, ownerKey),
  ]);
  const project = projectResult.results?.[0] as WorkspaceSnapshot["project"] | undefined;
  if (!project) return null;
  return {
    project,
    blocks: (blocksResult.results ?? []) as WorkspaceSnapshot["blocks"],
    items: (itemsResult.results ?? []) as WorkspaceSnapshot["items"],
  };
}
