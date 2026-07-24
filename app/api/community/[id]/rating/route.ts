import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const input = await request.json() as Partial<{ value: number }>;
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return Response.json({ error: "별점은 1~5점으로 입력해 줘." }, { status: 400 });
  }
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ratings (id, publication_id, user_id, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, publication_id)
     DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(crypto.randomUUID(), id, user.id, value, timestamp, timestamp).run();
  return Response.json({ value });
}
