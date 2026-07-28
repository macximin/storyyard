import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

export type ChatGPTUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  fullName: string | null;
  role: "admin" | "user";
};

const SESSION_COOKIE = "storyyard_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100_000;
const HUMAN_ACTION_GRANT_MS = 2 * 60 * 1000;

export type HumanActionKind =
  | "publication.write"
  | "publication.delete"
  | "project.public-metadata";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const tokenHash = await getSessionTokenHash();
  if (!tokenHash) return null;
  const now = new Date().toISOString();
  const [row] = await getDb()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
  if (!row) return null;
  return {
    id: row.user.id,
    username: row.user.username,
    displayName: row.user.displayName,
    email: row.user.ownerKey,
    fullName: row.user.displayName,
    role: row.user.role === "admin" ? "admin" : "user",
  };
}

export async function getSessionTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export function isHumanActionKind(value: unknown): value is HumanActionKind {
  return value === "publication.write"
    || value === "publication.delete"
    || value === "project.public-metadata";
}

export async function issueHumanActionGrant(
  userId: string,
  projectId: string,
  action: HumanActionKind,
): Promise<string | null> {
  const sessionTokenHash = await getSessionTokenHash();
  if (!sessionTokenHash) return null;
  const now = new Date();
  const grantToken = randomToken(32);
  const grantTokenHash = await sha256(grantToken);
  const issued = await env.DB.prepare(
    `UPDATE sessions
        SET human_action_token_hash = ?, human_action_project_id = ?,
            human_action_kind = ?, human_action_expires_at = ?
      WHERE token_hash = ? AND user_id = ? AND expires_at > ?
      RETURNING id`,
  ).bind(
    grantTokenHash,
    projectId,
    action,
    new Date(now.getTime() + HUMAN_ACTION_GRANT_MS).toISOString(),
    sessionTokenHash,
    userId,
    now.toISOString(),
  ).first<{ id: string }>();
  return issued ? grantToken : null;
}

export async function consumeHumanActionGrant(
  userId: string,
  projectId: string,
  action: HumanActionKind,
  grantToken: unknown,
): Promise<boolean> {
  if (typeof grantToken !== "string" || !grantToken) return false;
  const sessionTokenHash = await getSessionTokenHash();
  if (!sessionTokenHash) return false;
  const consumed = await env.DB.prepare(
    `UPDATE sessions
        SET human_action_token_hash = '', human_action_project_id = '',
            human_action_kind = '', human_action_expires_at = ''
      WHERE token_hash = ? AND user_id = ?
        AND human_action_token_hash = ? AND human_action_project_id = ?
        AND human_action_kind = ? AND human_action_expires_at > ?
      RETURNING id`,
  ).bind(
    sessionTokenHash,
    userId,
    await sha256(grantToken),
    projectId,
    action,
    new Date().toISOString(),
  ).first<{ id: string }>();
  return Boolean(consumed);
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/?auth=login&return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/api/auth/logout?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = randomToken(16);
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${salt}$${derived}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, salt, expected] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !salt || !expected) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  const actual = await derivePassword(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

export async function createUserSession(userId: string, remember = true): Promise<void> {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getDb().insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: runtimeSecret("STORYYARD_COOKIE_SECURE") === "true",
    sameSite: "lax",
    path: "/",
    maxAge: remember ? SESSION_DAYS * 24 * 60 * 60 : undefined,
  });
}

export async function clearUserSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
  }
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: runtimeSecret("STORYYARD_COOKIE_SECURE") === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function runtimeSecret(name: "STORYYARD_SETUP_CODE" | "STORYYARD_LEGACY_OWNER_EMAIL" | "STORYYARD_COOKIE_SECURE"): string {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  return runtimeEnv[name]?.trim() ?? "";
}

export function validUsername(value: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(value);
}

export function validPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 128;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

async function derivePassword(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromBase64Url(salt).buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function randomToken(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
