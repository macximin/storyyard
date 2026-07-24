import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user?.role === "admin" ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const [users, works, comments] = await Promise.all([
    env.DB.prepare("SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at DESC").all(),
    env.DB.prepare(
      `SELECT p.id, p.title, p.author_name, p.status, p.published_at,
              COUNT(DISTINCT r.id) AS rating_count, AVG(r.value) AS rating_average
         FROM publications p LEFT JOIN ratings r ON r.publication_id = p.id
        GROUP BY p.id ORDER BY p.updated_at DESC`,
    ).all(),
    env.DB.prepare(
      `SELECT c.id, c.body, c.status, c.created_at, u.display_name, p.title AS work_title
         FROM comments c JOIN users u ON u.id = c.user_id JOIN publications p ON p.id = c.publication_id
        ORDER BY c.created_at DESC LIMIT 100`,
    ).all(),
  ]);
  return Response.json({ users: users.results ?? [], works: works.results ?? [], comments: comments.results ?? [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "관리자 권한이 필요함." }, { status: 403 });
  const input = await request.json() as Partial<{ kind: string; id: string; status: string }>;
  if (!input.id || !["visible", "hidden", "published"].includes(input.status ?? "")) {
    return Response.json({ error: "잘못된 요청임." }, { status: 400 });
  }
  if (input.kind === "comment") {
    await env.DB.prepare("UPDATE comments SET status = ?, updated_at = ? WHERE id = ?")
      .bind(input.status, new Date().toISOString(), input.id).run();
  } else if (input.kind === "work") {
    await env.DB.prepare("UPDATE publications SET status = ?, updated_at = ? WHERE id = ?")
      .bind(input.status, new Date().toISOString(), input.id).run();
  } else {
    return Response.json({ error: "잘못된 요청임." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
