import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; episodeId: string }> },
) {
  const user = await getChatGPTUser();
  const { id, episodeId } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });

  const input = await request.json() as Partial<{ body: string }>;
  const body = input.body?.trim() ?? "";
  if (!body || body.length > 1000) {
    return Response.json({ error: "댓글은 1~1000자로 입력해 줘." }, { status: 400 });
  }

  const episode = await env.DB.prepare(
    `SELECT pe.id
       FROM publication_episodes pe
       JOIN publications p ON p.id = pe.publication_id
      WHERE pe.id = ? AND pe.publication_id = ? AND p.status = 'published'`,
  ).bind(episodeId, id).first<{ id: string }>();
  if (!episode) return Response.json({ error: "공개된 회차를 찾지 못했음." }, { status: 404 });

  const timestamp = new Date().toISOString();
  const comment = {
    id: crypto.randomUUID(),
    user_id: user.id,
    body,
    created_at: timestamp,
    display_name: user.displayName,
    username: user.username,
  };
  await env.DB.prepare(
    `INSERT INTO comments (id, publication_id, episode_id, user_id, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'visible', ?, ?)`,
  ).bind(comment.id, id, episodeId, user.id, body, timestamp, timestamp).run();
  return Response.json({ comment }, { status: 201 });
}
