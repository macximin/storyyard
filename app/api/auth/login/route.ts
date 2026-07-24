import { eq } from "drizzle-orm";
import { createUserSession, verifyPassword } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function POST(request: Request) {
  const input = await request.json() as Partial<{ username: string; password: string; remember: boolean }>;
  const username = input.username?.trim().toLowerCase() ?? "";
  const [user] = await getDb().select().from(users).where(eq(users.username, username));
  if (!user || !(await verifyPassword(input.password ?? "", user.passwordHash))) {
    return Response.json({ error: "아이디 또는 비밀번호가 맞지 않음." }, { status: 401 });
  }
  await createUserSession(user.id, input.remember !== false);
  return Response.json({
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  });
}
