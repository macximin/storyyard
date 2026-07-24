import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { manuscripts, projects } from "@/db/schema";

async function ownedProject(projectId: string, ownerKey: string) {
  const [project] = await getDb().select().from(projects).where(eq(projects.id, projectId));
  return project?.ownerEmail === ownerKey ? project : null;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  const rows = await getDb().select().from(manuscripts)
    .where(eq(manuscripts.projectId, id))
    .orderBy(asc(manuscripts.episodeNo));
  return Response.json({ manuscripts: rows });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  if (!user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  if (!(await ownedProject(id, user.email))) return Response.json({ error: "Not found" }, { status: 404 });
  const input = await request.json() as Partial<{ title: string }>;
  const current = await getDb().select({ episodeNo: manuscripts.episodeNo }).from(manuscripts)
    .where(eq(manuscripts.projectId, id));
  const episodeNo = Math.max(0, ...current.map((item) => item.episodeNo)) + 1;
  const timestamp = new Date().toISOString();
  const manuscript = {
    id: crypto.randomUUID(),
    projectId: id,
    episodeNo,
    title: input.title?.trim() || `${episodeNo}화`,
    body: "",
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await getDb().insert(manuscripts).values(manuscript);
  return Response.json({ manuscript }, { status: 201 });
}
