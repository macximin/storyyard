import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const existing = await env.DB.prepare(
    "SELECT id FROM publication_favorites WHERE publication_id = ? AND user_id = ?",
  ).bind(id, user.id).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare("DELETE FROM publication_favorites WHERE id = ?").bind(existing.id).run();
    return Response.json({ favorite: false });
  }
  await env.DB.prepare(
    "INSERT INTO publication_favorites (id, publication_id, user_id, created_at) VALUES (?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), id, user.id, new Date().toISOString()).run();
  return Response.json({ favorite: true });
}
