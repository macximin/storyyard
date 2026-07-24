import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { plotBlocks, projects } from "@/db/schema";

async function owns(projectId: string, email: string) {
  const [project] = await getDb().select({ id: projects.id }).from(projects)
    .where(eq(projects.id, projectId));
  return Boolean(project && (await getDb().select({ ownerEmail: projects.ownerEmail }).from(projects).where(eq(projects.id, projectId)))[0]?.ownerEmail === email);
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  if (!(await owns(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  const blocks = await getDb().select().from(plotBlocks).where(eq(plotBlocks.projectId, id)).orderBy(asc(plotBlocks.act), asc(plotBlocks.sortOrder));
  return Response.json({ blocks });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  if (!(await owns(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  const payload = (await request.json()) as { act?: number; title?: string; body?: string; kind?: string; sortOrder?: number };
  const block = { id: crypto.randomUUID(), projectId: id, act: payload.act ?? 1, kind: payload.kind ?? "scene", title: payload.title?.trim() || "새 블록", body: payload.body?.trim() || "", sortOrder: payload.sortOrder ?? Date.now(), updatedAt: new Date().toISOString() };
  await getDb().insert(plotBlocks).values(block);
  await getDb().update(projects).set({ updatedAt: block.updatedAt }).where(eq(projects.id, id));
  return Response.json({ block }, { status: 201 });
}
