import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projectItems, projects } from "@/db/schema";

function isFoundryProjection(meta: string) {
  try { return Boolean((JSON.parse(meta) as { foundrySync?: unknown }).foundrySync); }
  catch { return false; }
}

async function ownedActiveItem(id: string, email: string) {
  const [item] = await getDb().select().from(projectItems).where(eq(projectItems.id, id));
  const [project] = item ? await getDb().select().from(projects).where(eq(projects.id, item.projectId)) : [];
  return item && project?.ownerEmail === email && project.lifecycle === "active" ? item : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  const item = user ? await ownedActiveItem(id, user.email) : null;
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (isFoundryProjection(item.meta)) return Response.json({ error: "Foundry 정본 투영은 Storyyard에서 직접 수정할 수 없음." }, { status: 409 });
  const input = await request.json() as Partial<{ title: string; body: string; meta: string }>;
  const updatedAt = new Date().toISOString();
  await getDb().update(projectItems).set({ ...input, updatedAt }).where(eq(projectItems.id, id));
  await getDb().update(projects).set({ contentRevision: updatedAt, updatedAt }).where(eq(projects.id, item.projectId));
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  const item = user ? await ownedActiveItem(id, user.email) : null;
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (isFoundryProjection(item.meta)) return Response.json({ error: "Foundry 정본 투영은 Storyyard에서 삭제할 수 없음." }, { status: 409 });
  const updatedAt = new Date().toISOString();
  await getDb().delete(projectItems).where(eq(projectItems.id, id));
  await getDb().update(projects).set({ contentRevision: updatedAt, updatedAt }).where(eq(projects.id, item.projectId));
  return Response.json({ ok: true });
}
