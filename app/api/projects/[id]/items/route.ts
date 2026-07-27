import { and, asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projectItems, projects } from "@/db/schema";

async function owns(projectId: string, email: string) { const [p] = await getDb().select().from(projects).where(eq(projects.id, projectId)); return p?.ownerEmail === email; }
export async function GET(_: Request, c: { params: Promise<{ id: string }> }) { const user = await getChatGPTUser(); const { id } = await c.params; if (!user || !(await owns(id, user.email))) return Response.json({ error:"Not found" },{status:404}); const items=await getDb().select().from(projectItems).where(eq(projectItems.projectId,id)).orderBy(asc(projectItems.updatedAt)); return Response.json({items}); }
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id: projectId } = await c.params;
  if (!user || !(await owns(projectId, user.email))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const x = await r.json() as { kind?: string; title?: string; body?: string; meta?: string };
  const kind = x.kind || "character";
  const meta = x.meta || "{}";

  if (kind === "plot") {
    try {
      const parsed = JSON.parse(meta) as { isDefault?: boolean };
      if (parsed.isDefault === true) {
        const existingPlots = await getDb()
          .select()
          .from(projectItems)
          .where(and(eq(projectItems.projectId, projectId), eq(projectItems.kind, "plot")));
        const existing = existingPlots.find((item) => {
          try {
            return (JSON.parse(item.meta) as { isDefault?: boolean }).isDefault === true;
          } catch {
            return false;
          }
        });
        if (existing) return Response.json({ item: existing });
      }
    } catch {
      // Invalid metadata falls through to the normal item creation path.
    }
  }

  const item = {
    id: crypto.randomUUID(),
    projectId,
    kind,
    title: x.title?.trim() || "새 항목",
    body: x.body?.trim() || "",
    meta,
    updatedAt: new Date().toISOString(),
  };
  await getDb().insert(projectItems).values(item);
  await getDb().update(projects).set({ contentRevision: item.updatedAt, updatedAt: item.updatedAt }).where(eq(projects.id, projectId));
  return Response.json({ item }, { status: 201 });
}
