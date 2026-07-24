import { eq } from "drizzle-orm";
import {
  createPasswordHash,
  createUserSession,
  runtimeSecret,
  validPassword,
  validUsername,
} from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function POST(request: Request) {
  const input = await request.json() as Partial<{
    username: string;
    password: string;
    displayName: string;
    remember: boolean;
    setupCode: string;
  }>;
  const username = input.username?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";
  const displayName = input.displayName?.trim() || username;
  if (!validUsername(username)) {
    return Response.json({ error: "아이디는 영문, 숫자, 밑줄 3~24자로 입력해 줘." }, { status: 400 });
  }
  if (!validPassword(password)) {
    return Response.json({ error: "비밀번호는 8자 이상으로 입력해 줘." }, { status: 400 });
  }
  if (displayName.length > 32) {
    return Response.json({ error: "표시 이름은 32자 이하로 입력해 줘." }, { status: 400 });
  }

  const db = getDb();
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
  const firstUser = existingUsers.length === 0;
  if (firstUser) {
    const requiredCode = runtimeSecret("STORYYARD_SETUP_CODE");
    if (!requiredCode || input.setupCode !== requiredCode) {
      return Response.json({ error: "관리자 초기 설정 코드가 맞지 않음." }, { status: 403 });
    }
  }
  const [duplicate] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (duplicate) return Response.json({ error: "이미 사용 중인 아이디임." }, { status: 409 });

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const ownerKey = firstUser
    ? runtimeSecret("STORYYARD_LEGACY_OWNER_EMAIL") || `user:${id}`
    : `user:${id}`;
  await db.insert(users).values({
    id,
    username,
    passwordHash: await createPasswordHash(password),
    displayName,
    ownerKey,
    role: firstUser ? "admin" : "user",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await createUserSession(id, input.remember !== false);
  return Response.json({
    user: { id, username, displayName, role: firstUser ? "admin" : "user" },
  }, { status: 201 });
}
