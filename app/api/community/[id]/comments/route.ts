import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const input = await request.json() as Partial<{ body: string }>;
  const body = input.body?.trim() ?? "";
  if (!body || body.length > 1000) {
    return Response.json({ error: "댓글은 1~1000자로 입력해 줘." }, { status: 400 });
  }
  const timestamp = new Date().toISOString();
  const comment = { id: crypto.randomUUID(), body, createdAt: timestamp, displayName: user.displayName };
  await env.DB.prepare(
    `INSERT INTO comments (id, publication_id, user_id, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'visible', ?, ?)`,
  ).bind(comment.id, id, user.id, body, timestamp, timestamp).run();
  return Response.json({ comment }, { status: 201 });
}
