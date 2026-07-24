import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });

  const comment = await env.DB.prepare(
    "SELECT user_id FROM comments WHERE id = ?",
  ).bind(id).first<{ user_id: string }>();
  if (!comment) return Response.json({ error: "댓글을 찾지 못했음." }, { status: 404 });
  if (comment.user_id !== user.id && user.role !== "admin") {
    return Response.json({ error: "본인 댓글만 삭제할 수 있음." }, { status: 403 });
  }

  await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}
