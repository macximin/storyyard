import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PublicEpisodeReader } from "@/app/public-episode-reader";
import { getPublicEpisode } from "@/app/public-episode-data";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { slug, episode } = await params;
  const user = await getChatGPTUser();
  const snapshot = await getPublicEpisode(slug, Number(episode));
  return (
    <PublicEpisodeReader
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={false}
      snapshot={snapshot}
    />
  );
}
