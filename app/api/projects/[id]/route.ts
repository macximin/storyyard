import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const [project] = await getDb().select().from(projects).where(eq(projects.id, id));
  if (!project || project.ownerEmail !== user.email) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ project });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const [project] = await getDb().select().from(projects).where(eq(projects.id, id));
  if (!project || project.ownerEmail !== user.email) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const input = (await request.json()) as Partial<{
    title: string;
    logline: string;
    genre: string;
    favorite: boolean | number;
  }>;
  const update: Partial<typeof project> = { updatedAt: new Date().toISOString() };
  if (typeof input.title === "string") update.title = input.title.trim() || project.title;
  if (typeof input.logline === "string") update.logline = input.logline.trim();
  if (typeof input.genre === "string") update.genre = input.genre.trim() || "웹소설";
  if (typeof input.favorite === "boolean") update.favorite = input.favorite ? 1 : 0;
  if (typeof input.favorite === "number") update.favorite = input.favorite ? 1 : 0;
  await getDb().update(projects).set(update).where(eq(projects.id, id));
  // 공개본의 기본 정보는 별도 갱신 버튼 없이 작업실 원본을 즉시 따라간다.
  await env.DB.prepare(
    "UPDATE publications SET title = ?, logline = ?, genre = ?, updated_at = ? WHERE project_id = ?",
  ).bind(
    update.title ?? project.title,
    update.logline ?? project.logline,
    update.genre ?? project.genre,
    update.updatedAt,
    id,
  ).run();
  return Response.json({ project: { ...project, ...update } });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const [project] = await getDb().select().from(projects).where(eq(projects.id, id));
  if (!project || project.ownerEmail !== user.email) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const publication = await env.DB.prepare("SELECT id FROM publications WHERE project_id = ?").bind(id).first<{ id: string }>();
  const publicationId = publication?.id ?? "";
  await env.DB.batch([
    env.DB.prepare("DELETE FROM comments WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM ratings WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM publication_favorites WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM publication_episodes WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM publication_content WHERE publication_id = ?").bind(publicationId),
    env.DB.prepare("DELETE FROM publications WHERE project_id = ?").bind(id),
    env.DB.prepare("DELETE FROM manuscripts WHERE project_id = ?").bind(id),
    env.DB.prepare("DELETE FROM plot_blocks WHERE project_id = ?").bind(id),
    env.DB.prepare("DELETE FROM project_items WHERE project_id = ?").bind(id),
    env.DB.prepare("DELETE FROM projects WHERE id = ? AND owner_email = ?").bind(id, user.email),
  ]);

  return Response.json({ ok: true });
}
