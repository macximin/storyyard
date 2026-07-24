import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projectItems, projects } from "@/db/schema";

async function owns(projectId: string, email: string) { const [p] = await getDb().select().from(projects).where(eq(projects.id, projectId)); return p?.ownerEmail === email; }
export async function GET(_: Request, c: { params: Promise<{ id: string }> }) { const user = await getChatGPTUser(); const { id } = await c.params; if (!user || !(await owns(id, user.email))) return Response.json({ error:"Not found" },{status:404}); const items=await getDb().select().from(projectItems).where(eq(projectItems.projectId,id)).orderBy(asc(projectItems.updatedAt)); return Response.json({items}); }
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) { const user=await getChatGPTUser(); const {id:projectId}=await c.params; if(!user||!(await owns(projectId,user.email)))return Response.json({error:"Not found"},{status:404}); const x=await r.json() as {kind?:string;title?:string;body?:string;meta?:string}; const item={id:crypto.randomUUID(),projectId,kind:x.kind||"character",title:x.title?.trim()||"새 항목",body:x.body?.trim()||"",meta:x.meta||"{}",updatedAt:new Date().toISOString()}; await getDb().insert(projectItems).values(item); await getDb().update(projects).set({updatedAt:item.updatedAt}).where(eq(projects.id,projectId)); return Response.json({item},{status:201}); }
