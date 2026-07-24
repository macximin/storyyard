import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
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
    favorite: boolean | number;
  }>;
  const update: Partial<typeof project> = { updatedAt: new Date().toISOString() };
  if (typeof input.title === "string") update.title = input.title.trim() || project.title;
  if (typeof input.logline === "string") update.logline = input.logline.trim();
  if (typeof input.genre === "string") update.genre = input.genre.trim() || "웹소설";
  if (typeof input.favorite === "boolean") update.favorite = input.favorite ? 1 : 0;
  if (typeof input.favorite === "number") update.favorite = input.favorite ? 1 : 0;
  await getDb().update(projects).set(update).where(eq(projects.id, id));
  return Response.json({ project: { ...project, ...update } });
}
