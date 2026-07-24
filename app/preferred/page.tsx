import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CommunityHome } from "@/app/community-home";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function PreferredPage() {
  const user = await getChatGPTUser();
  const existing = await getDb().select({ id: users.id }).from(users).limit(1);
  return (
    <CommunityHome
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={!existing.length}
      preferred
    />
  );
}
