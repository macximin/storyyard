import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { plotBlocks, projects } from "@/db/schema";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  const [block] = await getDb().select().from(plotBlocks).where(eq(plotBlocks.id, id));
  if (!block) return Response.json({ error: "Not found" }, { status: 404 });
  const [project] = await getDb().select().from(projects).where(eq(projects.id, block.projectId));
  if (!project || project.ownerEmail !== user.email) return Response.json({ error: "Not found" }, { status: 404 });
  const input = (await request.json()) as Partial<{ act: number; title: string; body: string; kind: string; sortOrder: number }>;
  const update = { ...input, updatedAt: new Date().toISOString() };
  await getDb().update(plotBlocks).set(update).where(eq(plotBlocks.id, id));
  return Response.json({ ok: true });
}
