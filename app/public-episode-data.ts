import { env } from "cloudflare:workers";

export type PublicEpisodeSnapshot = {
  work: {
    id: string;
    slug: string;
    title: string;
    authorName: string;
  };
  episode: {
    id: string;
    episode_no: number;
    title: string;
    body: string;
    published_at: string;
    updated_at: string;
  };
  episodes: Array<{
    id: string;
    episode_no: number;
    title: string;
    comment_count: number;
  }>;
  comments: Array<{
    id: string;
    user_id: string;
    body: string;
    created_at: string;
    display_name: string;
    username: string;
  }>;
};

export async function getPublicEpisode(
  slug: string,
  episodeNo: number,
): Promise<PublicEpisodeSnapshot | null> {
  if (!Number.isInteger(episodeNo) || episodeNo < 1) return null;

  const publication = await env.DB.prepare(
    `SELECT id, slug, title, author_name
       FROM publications
      WHERE slug = ? AND status = 'published'`,
  ).bind(slug).first<Record<string, unknown>>();
  if (!publication) return null;

  const publicationId = String(publication.id);
  const [episode, episodes, comments] = await Promise.all([
    env.DB.prepare(
      `SELECT id, episode_no, title, body, published_at, updated_at
         FROM publication_episodes
        WHERE publication_id = ? AND episode_no = ?`,
    ).bind(publicationId, episodeNo).first<PublicEpisodeSnapshot["episode"]>(),
    env.DB.prepare(
      `SELECT pe.id, pe.episode_no, pe.title,
              (SELECT COUNT(*) FROM comments c
                WHERE c.episode_id = pe.id AND c.status = 'visible') AS comment_count
         FROM publication_episodes pe
        WHERE pe.publication_id = ?
        ORDER BY pe.episode_no ASC`,
    ).bind(publicationId).all<PublicEpisodeSnapshot["episodes"][number]>(),
    env.DB.prepare(
      `SELECT c.id, c.user_id, c.body, c.created_at, u.display_name, u.username
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.publication_id = ?
          AND c.episode_id = (
            SELECT id FROM publication_episodes
             WHERE publication_id = ? AND episode_no = ?
          )
          AND c.status = 'visible'
        ORDER BY c.created_at DESC`,
    ).bind(publicationId, publicationId, episodeNo)
      .all<PublicEpisodeSnapshot["comments"][number]>(),
  ]);
  if (!episode) return null;

  return {
    work: {
      id: publicationId,
      slug: String(publication.slug),
      title: String(publication.title),
      authorName: String(publication.author_name),
    },
    episode,
    episodes: (episodes.results ?? []).map((item) => ({
      ...item,
      comment_count: Number(item.comment_count ?? 0),
    })),
    comments: (comments.results ?? []) as PublicEpisodeSnapshot["comments"],
  };
}
