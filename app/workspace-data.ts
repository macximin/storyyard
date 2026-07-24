import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { plotBlocks, projectItems, projects } from "@/db/schema";

export type WorkspaceSnapshot = {
  project: {
    id: string;
    title: string;
    logline: string;
    genre: string;
    favorite: number;
    updatedAt: string;
  };
  blocks: Array<{
    id: string;
    act: number;
    kind: string;
    title: string;
    body: string;
    meta: string;
    sortOrder: number;
  }>;
  items: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    meta: string;
    updatedAt: string;
  }>;
};

export async function getOwnedWorkspace(
  projectId: string,
  ownerKey: string,
): Promise<WorkspaceSnapshot | null> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.ownerEmail !== ownerKey) return null;
  const [blocks, items] = await Promise.all([
    db.select().from(plotBlocks)
      .where(eq(plotBlocks.projectId, projectId))
      .orderBy(asc(plotBlocks.act), asc(plotBlocks.sortOrder)),
    db.select().from(projectItems)
      .where(eq(projectItems.projectId, projectId))
      .orderBy(asc(projectItems.updatedAt)),
  ]);
  return { project, blocks, items };
}
