import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PublicEpisodeReader } from "@/app/public-episode-reader";
import { getPublicEpisode } from "@/app/public-episode-data";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { slug, episode } = await params;
  const user = await getChatGPTUser();
  const [existing, snapshot] = await Promise.all([
    getDb().select({ id: users.id }).from(users).limit(1),
    getPublicEpisode(slug, Number(episode)),
  ]);
  return (
    <PublicEpisodeReader
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={!existing.length}
      snapshot={snapshot}
    />
  );
}
