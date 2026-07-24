import { getChatGPTUser } from "./chatgpt-auth";
import { CommunityHome } from "./community-home";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCommunityWorks } from "./community-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const [existing, initialWorks] = await Promise.all([
    getDb().select({ id: users.id }).from(users).limit(1),
    getCommunityWorks({ userId: user?.id ?? "", sort: "rating" }),
  ]);
  return (
    <CommunityHome
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={!existing.length}
      initialWorks={initialWorks}
    />
  );
}
