import { env } from "cloudflare:workers";
import { redirect } from "next/navigation";
import {
  chatGPTSignInPath,
  getSessionTokenHash,
  type ChatGPTUser,
} from "@/app/chatgpt-auth";
import type { CoverKey } from "@/app/cover-options";

export type WorkspaceSnapshot = {
  project: {
    id: string;
    title: string;
    logline: string;
    genre: string;
    coverKey: CoverKey;
    favorite: number;
    contentRevision: string;
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
    updatedAt?: string;
  }>;
};

type AuthenticatedWorkspace = {
  user: ChatGPTUser | null;
  snapshot: WorkspaceSnapshot | null;
};

type AuthenticatedUserRow = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  fullName: string | null;
  role: string;
};

export async function getAuthenticatedWorkspace(
  projectId: string,
): Promise<AuthenticatedWorkspace> {
  const tokenHash = await getSessionTokenHash();
  if (!tokenHash) return { user: null, snapshot: null };
  const now = new Date().toISOString();
  const authorizedSession = `
    EXISTS (
      SELECT 1
        FROM sessions s
        JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.expires_at > ?
         AND u.owner_key = projects.owner_email
    )`;
  const [userResult, projectResult, blocksResult, itemsResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.username, u.display_name AS "displayName",
              u.owner_key AS email, u.display_name AS "fullName", u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        LIMIT 1`,
    ).bind(tokenHash, now),
    env.DB.prepare(
      `SELECT id, title, logline, genre, cover_key AS "coverKey", favorite,
              content_revision AS "contentRevision", updated_at AS "updatedAt"
         FROM projects
        WHERE id = ? AND ${authorizedSession}`,
    ).bind(projectId, tokenHash, now),
    env.DB.prepare(
      `SELECT id, act, kind, title, body, meta, sort_order AS "sortOrder"
         FROM plot_blocks
        WHERE project_id = ?
          AND EXISTS (
            SELECT 1 FROM projects
             WHERE projects.id = ?
               AND ${authorizedSession}
          )
        ORDER BY act ASC, sort_order ASC`,
    ).bind(projectId, projectId, tokenHash, now),
    env.DB.prepare(
      `SELECT id, kind, title, body, meta, updated_at AS "updatedAt"
         FROM project_items
        WHERE project_id = ?
          AND EXISTS (
            SELECT 1 FROM projects
             WHERE projects.id = ?
               AND ${authorizedSession}
          )
        ORDER BY updated_at ASC`,
    ).bind(projectId, projectId, tokenHash, now),
  ]);
  const userRow = userResult.results?.[0] as AuthenticatedUserRow | undefined;
  const user = userRow ? {
    id: userRow.id,
    username: userRow.username,
    displayName: userRow.displayName,
    email: userRow.email,
    fullName: userRow.fullName,
    role: userRow.role === "admin" ? "admin" as const : "user" as const,
  } : null;
  const project = projectResult.results?.[0] as WorkspaceSnapshot["project"] | undefined;
  return {
    user,
    snapshot: project ? {
      project,
      blocks: (blocksResult.results ?? []) as WorkspaceSnapshot["blocks"],
      items: (itemsResult.results ?? []) as WorkspaceSnapshot["items"],
    } : null,
  };
}

export async function requireAuthenticatedWorkspace(
  projectId: string,
  returnTo: string,
) {
  const result = await getAuthenticatedWorkspace(projectId);
  if (!result.user) redirect(chatGPTSignInPath(returnTo));
  return { user: result.user, initialSnapshot: result.snapshot };
}

export async function getOwnedWorkspace(
  projectId: string,
  ownerKey: string,
): Promise<WorkspaceSnapshot | null> {
  const [projectResult, blocksResult, itemsResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, title, logline, genre, cover_key AS "coverKey", favorite,
              content_revision AS "contentRevision", updated_at AS "updatedAt"
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
