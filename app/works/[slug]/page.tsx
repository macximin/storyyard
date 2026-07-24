import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PublicWork } from "@/app/public-work";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getChatGPTUser();
  const existing = await getDb().select({ id: users.id }).from(users).limit(1);
  return (
    <PublicWork
      slug={slug}
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={!existing.length}
    />
  );
}
