import { eq } from "drizzle-orm";
import {
  getChatGPTUser,
  isHumanActionKind,
  issueHumanActionGrant,
  verifyPassword,
} from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projects, users } from "@/db/schema";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "인간 관리자 확인이 필요한 작업임." }, { status: 403 });
  }
  const input = await request.json().catch(() => null) as {
    projectId?: unknown;
    action?: unknown;
    password?: unknown;
  } | null;
  const projectId = typeof input?.projectId === "string" ? input.projectId.trim() : "";
  if (!projectId || !isHumanActionKind(input?.action)) {
    return Response.json({ error: "인간 확인 대상이 올바르지 않음." }, { status: 400 });
  }
  const db = getDb();
  const [[project], [credential]] = await Promise.all([
    db.select({ ownerEmail: projects.ownerEmail }).from(projects).where(eq(projects.id, projectId)),
    db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)),
  ]);
  if (!project || project.ownerEmail !== user.email) {
    return Response.json({ error: "작품을 찾을 수 없음." }, { status: 404 });
  }
  if (
    !credential
    || typeof input?.password !== "string"
    || !(await verifyPassword(input.password, credential.passwordHash))
  ) {
    return Response.json({ error: "인간 관리자 비밀번호 확인에 실패함." }, { status: 401 });
  }
  const grantToken = await issueHumanActionGrant(user.id, projectId, input.action);
  if (!grantToken) {
    return Response.json({ error: "인간 확인 세션을 만들지 못했음." }, { status: 409 });
  }
  return Response.json(
    { grantToken, action: input.action, expiresInSeconds: 120 },
    { headers: { "cache-control": "no-store" } },
  );
}
