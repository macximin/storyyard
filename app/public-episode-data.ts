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

  const [publicationResult, episodeResult, episodesResult, commentsResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, slug, title, author_name
         FROM publications
        WHERE slug = ? AND status = 'published'`,
    ).bind(slug),
    env.DB.prepare(
      `SELECT pe.id, pe.episode_no, pe.title, pe.body, pe.published_at, pe.updated_at
         FROM publication_episodes pe
         JOIN publications p ON p.id = pe.publication_id
        WHERE p.slug = ? AND p.status = 'published' AND pe.episode_no = ?`,
    ).bind(slug, episodeNo),
    env.DB.prepare(
      `SELECT pe.id, pe.episode_no, pe.title,
              (SELECT COUNT(*) FROM comments c
                WHERE c.episode_id = pe.id AND c.status = 'visible') AS comment_count
         FROM publication_episodes pe
         JOIN publications p ON p.id = pe.publication_id
        WHERE p.slug = ? AND p.status = 'published'
        ORDER BY pe.episode_no ASC`,
    ).bind(slug),
    env.DB.prepare(
      `SELECT c.id, c.user_id, c.body, c.created_at, u.display_name, u.username
         FROM comments c
         JOIN users u ON u.id = c.user_id
         JOIN publication_episodes pe ON pe.id = c.episode_id
         JOIN publications p ON p.id = pe.publication_id
        WHERE p.slug = ? AND p.status = 'published'
          AND pe.episode_no = ?
          AND c.status = 'visible'
        ORDER BY c.created_at DESC`,
    ).bind(slug, episodeNo),
  ]);
  const publication = publicationResult.results?.[0] as Record<string, unknown> | undefined;
  if (!publication) return null;

  const publicationId = String(publication.id);
  const episode = episodeResult.results?.[0] as PublicEpisodeSnapshot["episode"] | undefined;
  if (!episode) return null;

  return {
    work: {
      id: publicationId,
      slug: String(publication.slug),
      title: String(publication.title),
      authorName: String(publication.author_name),
    },
    episode,
    episodes: ((episodesResult.results ?? []) as PublicEpisodeSnapshot["episodes"]).map((item) => ({
      ...item,
      comment_count: Number(item.comment_count ?? 0),
    })),
    comments: (commentsResult.results ?? []) as PublicEpisodeSnapshot["comments"],
  };
}
