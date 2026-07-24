import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";

function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const rows = await getDb().select().from(projects)
    .where(eq(projects.ownerEmail, user.email))
    .orderBy(desc(projects.updatedAt));
  return Response.json({ projects: rows });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const payload = (await request.json()) as { title?: string; logline?: string; genre?: string };
  const title = payload.title?.trim() || "새 작품";
  const timestamp = now();
  const project = {
    id: id(), ownerEmail: user.email, title,
    logline: payload.logline?.trim() || "이 작품의 한 줄 출발점을 적어 보세요.",
    genre: payload.genre?.trim() || "웹소설", favorite: 0,
    updatedAt: timestamp, createdAt: timestamp,
  };
  await getDb().insert(projects).values(project);
  return Response.json({ project }, { status: 201 });
}
