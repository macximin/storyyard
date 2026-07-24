import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { Library } from "@/app/library";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await requireChatGPTUser("/studio");
  const initialProjects = await getDb().select().from(projects)
    .where(eq(projects.ownerEmail, user.email))
    .orderBy(desc(projects.updatedAt));
  return (
    <Library
      user={{ id: user.id, username: user.username, displayName: user.displayName, role: user.role }}
      initialProjects={initialProjects}
    />
  );
}
