import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  const rows = await getDb().select({ id: users.id }).from(users).limit(1);
  return Response.json({
    user: user ? {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    } : null,
    setupRequired: rows.length === 0,
  });
}
