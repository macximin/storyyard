import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { consumeHumanActionGrant, getChatGPTUser } from "@/app/chatgpt-auth";
import { getCoverOption, isCoverKey } from "@/app/cover-options";
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
    coverKey: string;
    favorite: boolean | number;
    humanActionToken: string;
  }>;
  if (input.coverKey !== undefined && !isCoverKey(input.coverKey)) {
    return Response.json({ error: "허용되지 않은 표지임." }, { status: 400 });
  }
  const binding = await env.DB.prepare("SELECT project_id FROM canon_bindings WHERE project_id = ?")
    .bind(id).first();
  const requestedTitle = typeof input.title === "string"
    ? input.title.trim() || project.title
    : project.title;
  const requestedLogline = typeof input.logline === "string"
    ? input.logline.trim()
    : project.logline;
  if (
    binding
    && (requestedTitle !== project.title || requestedLogline !== project.logline)
  ) {
    return Response.json({
      error: "Foundry 정본 작품의 제목과 소개는 정본 전체 동기화로만 갱신할 수 있음.",
    }, { status: 409 });
  }
  const timestamp = new Date().toISOString();
  const next = {
    ...project,
    title: requestedTitle,
    logline: requestedLogline,
    genre: typeof input.genre === "string" ? input.genre.trim() || "웹소설" : project.genre,
    coverKey: isCoverKey(input.coverKey) ? input.coverKey : project.coverKey,
    favorite: typeof input.favorite === "boolean" || typeof input.favorite === "number"
      ? input.favorite ? 1 : 0
      : project.favorite,
    updatedAt: timestamp,
  };
  const cover = getCoverOption(next.coverKey);
  const syncPublication = typeof input.title === "string"
    || typeof input.logline === "string"
    || typeof input.genre === "string"
    || input.coverKey !== undefined;
  const publicPublication = binding && syncPublication
    ? await env.DB.prepare("SELECT id FROM publications WHERE project_id = ? AND status = 'published'")
      .bind(id).first<{ id: string }>()
    : null;
  if (publicPublication) {
    if (user.role !== "admin") {
      return Response.json({ error: "정본 공개 정보 변경은 인간 관리자 확인이 필요함." }, { status: 403 });
    }
    if (!(await consumeHumanActionGrant(user.id, id, "project.public-metadata", input.humanActionToken))) {
      return Response.json({
        error: "공개 정보 변경 직전에 인간 관리자 비밀번호 확인이 필요함.",
        humanActionRequired: "project.public-metadata",
      }, { status: 428 });
    }
  }
  const statements = [
    env.DB.prepare(
      `UPDATE projects
          SET title = ?, logline = ?, genre = ?, cover_key = ?, favorite = ?, updated_at = ?
        WHERE id = ? AND owner_email = ?`,
    ).bind(next.title, next.logline, next.genre, next.coverKey, next.favorite, timestamp, id, user.email),
  ];
  if (syncPublication) {
    statements.push(
      env.DB.prepare(
        `UPDATE publications
            SET title = ?, logline = ?, genre = ?, cover_key = ?, cover_url = ?, updated_at = ?
          WHERE project_id = ?`,
      ).bind(next.title, next.logline, next.genre, next.coverKey, cover.src, timestamp, id),
    );
  }
  await env.DB.batch(statements);
  const publication = syncPublication
    ? await env.DB.prepare(
      "SELECT slug, status, updated_at AS updatedAt FROM publications WHERE project_id = ?",
    ).bind(id).first<{ slug: string; status: string; updatedAt: string }>()
    : null;
  return Response.json({
    project: next,
    publication: publication ? { ...publication, revision: publication.updatedAt } : null,
  });
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
    env.DB.prepare("DELETE FROM canon_bindings WHERE project_id = ?").bind(id),
    env.DB.prepare("DELETE FROM projects WHERE id = ? AND owner_email = ?").bind(id, user.email),
  ]);

  return Response.json({ ok: true });
}
