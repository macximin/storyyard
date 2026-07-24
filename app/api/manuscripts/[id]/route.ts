import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { manuscripts, projects } from "@/db/schema";

async function owned(id: string, ownerKey: string) {
  const [manuscript] = await getDb().select().from(manuscripts).where(eq(manuscripts.id, id));
  if (!manuscript) return null;
  const [project] = await getDb().select().from(projects).where(eq(projects.id, manuscript.projectId));
  return project?.ownerEmail === ownerKey ? manuscript : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const manuscript = await owned(id, user.email);
  if (!manuscript) return Response.json({ error: "Not found" }, { status: 404 });
  const input = await request.json() as Partial<{ title: string; body: string; status: string }>;
  const update: Partial<typeof manuscript> = { updatedAt: new Date().toISOString() };
  if (typeof input.title === "string") update.title = input.title.trim() || `${manuscript.episodeNo}화`;
  if (typeof input.body === "string") update.body = input.body;
  if (input.status === "draft" || input.status === "published") update.status = input.status;
  await getDb().update(manuscripts).set(update).where(eq(manuscripts.id, id));
  return Response.json({ manuscript: { ...manuscript, ...update } });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const manuscript = await owned(id, user.email);
  if (!manuscript) return Response.json({ error: "Not found" }, { status: 404 });
  await getDb().delete(manuscripts).where(eq(manuscripts.id, id));
  return Response.json({ ok: true });
}
