import { asc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { manuscripts, publicationEpisodes, publications, projects } from "@/db/schema";

async function ownedProject(projectId: string, ownerKey: string) {
  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId));
  return project?.ownerEmail === ownerKey ? project : null;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  const [publication] = await getDb().select().from(publications).where(eq(publications.projectId, id));
  const episodeRows = publication
    ? await getDb().select().from(publicationEpisodes)
      .where(eq(publicationEpisodes.publicationId, publication.id))
      .orderBy(asc(publicationEpisodes.episodeNo))
    : [];
  return Response.json({ publication: publication ?? null, episodes: episodeRows });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id: projectId } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const project = await ownedProject(projectId, user.email);
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });
  const input = await request.json() as Partial<{
    title: string;
    logline: string;
    genre: string;
    coverUrl: string;
    authorName: string;
    episodeIds: string[];
  }>;
  const episodeIds = Array.isArray(input.episodeIds) ? input.episodeIds.filter(Boolean) : [];
  if (!episodeIds.length) {
    return Response.json({ error: "공개할 원고를 한 편 이상 골라 줘." }, { status: 400 });
  }
  const selected = await getDb().select().from(manuscripts)
    .where(inArray(manuscripts.id, episodeIds))
    .orderBy(asc(manuscripts.episodeNo));
  if (selected.length !== episodeIds.length || selected.some((item) => item.projectId !== projectId)) {
    return Response.json({ error: "공개 원고 선택이 올바르지 않음." }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(publications).where(eq(publications.projectId, projectId));
  const timestamp = new Date().toISOString();
  const publicationId = existing?.id ?? crypto.randomUUID();
  const publication = {
    id: publicationId,
    projectId,
    ownerUserId: user.id,
    slug: existing?.slug ?? `work-${publicationId.slice(0, 8)}`,
    title: input.title?.trim() || project.title,
    logline: input.logline?.trim() || project.logline,
    genre: input.genre?.trim() || project.genre,
    coverUrl: safeCoverUrl(input.coverUrl),
    authorName: input.authorName?.trim() || user.displayName,
    status: "published",
    publishedAt: existing?.publishedAt ?? timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    await db.update(publications).set(publication).where(eq(publications.id, publicationId));
  } else {
    await db.insert(publications).values(publication);
  }

  const batch = [
    env.DB.prepare("DELETE FROM publication_episodes WHERE publication_id = ?").bind(publicationId),
    ...selected.map((item) =>
      env.DB.prepare(
        `INSERT INTO publication_episodes
          (id, publication_id, source_manuscript_id, episode_no, title, body, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        publicationId,
        item.id,
        item.episodeNo,
        item.title,
        item.body,
        timestamp,
        timestamp,
      ),
    ),
  ];
  await env.DB.batch(batch);
  await db.update(manuscripts).set({ status: "draft" }).where(eq(manuscripts.projectId, projectId));
  await db.update(manuscripts).set({ status: "published" }).where(inArray(manuscripts.id, episodeIds));
  return Response.json({ publication });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  await getDb().update(publications).set({
    status: "draft",
    updatedAt: new Date().toISOString(),
  }).where(eq(publications.projectId, id));
  return Response.json({ ok: true });
}

function safeCoverUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "/default-cover.png";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : "/default-cover.png";
  } catch {
    return "/default-cover.png";
  }
}
