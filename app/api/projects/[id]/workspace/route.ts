import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { plotBlocks, projectItems, projects } from "@/db/schema";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await context.params;
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project || project.ownerEmail !== user.email) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [blocks, items] = await Promise.all([
    db
      .select()
      .from(plotBlocks)
      .where(eq(plotBlocks.projectId, id))
      .orderBy(asc(plotBlocks.act), asc(plotBlocks.sortOrder)),
    db
      .select()
      .from(projectItems)
      .where(eq(projectItems.projectId, id))
      .orderBy(asc(projectItems.updatedAt)),
  ]);

  return Response.json({ project, blocks, items });
}
