import { env } from "cloudflare:workers";

export type PublicWorkSnapshot = {
  work: {
    id: string;
    slug: string;
    title: string;
    logline: string;
    genre: string;
    coverUrl: string;
    authorName: string;
    publishedAt: string;
    ratingAverage: number;
    ratingCount: number;
    isFavorite: boolean;
    myRating: number;
  };
  episodes: Array<{
    id: string;
    episode_no: number;
    title: string;
    body: string;
    published_at: string;
    updated_at: string;
  }>;
  comments: Array<{
    id: string;
    body: string;
    created_at: string;
    display_name: string;
    username: string;
  }>;
};

export async function getPublicWork(
  idOrSlug: string,
  userId = "",
): Promise<PublicWorkSnapshot | null> {
  const publication = await env.DB.prepare(
    `SELECT p.*,
            COALESCE((SELECT AVG(r.value) FROM ratings r WHERE r.publication_id = p.id), 0) AS rating_average,
            (SELECT COUNT(*) FROM ratings r WHERE r.publication_id = p.id) AS rating_count,
            CASE WHEN EXISTS (
              SELECT 1 FROM publication_favorites pf
              WHERE pf.publication_id = p.id AND pf.user_id = ?
            ) THEN 1 ELSE 0 END AS is_favorite,
            (SELECT value FROM ratings mr WHERE mr.publication_id = p.id AND mr.user_id = ?) AS my_rating
       FROM publications p
      WHERE (p.id = ? OR p.slug = ?) AND p.status = 'published'`,
  ).bind(userId, userId, idOrSlug, idOrSlug).first<Record<string, unknown>>();
  if (!publication) return null;

  const publicationId = String(publication.id);
  const [episodes, comments] = await Promise.all([
    env.DB.prepare(
      `SELECT id, episode_no, title, body, published_at, updated_at
         FROM publication_episodes WHERE publication_id = ? ORDER BY episode_no ASC`,
    ).bind(publicationId).all<PublicWorkSnapshot["episodes"][number]>(),
    env.DB.prepare(
      `SELECT c.id, c.body, c.created_at, u.display_name, u.username
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.publication_id = ? AND c.status = 'visible'
        ORDER BY c.created_at DESC`,
    ).bind(publicationId).all<PublicWorkSnapshot["comments"][number]>(),
  ]);

  return {
    work: {
      id: publicationId,
      slug: String(publication.slug),
      title: String(publication.title),
      logline: String(publication.logline),
      genre: String(publication.genre),
      coverUrl: String(publication.cover_url),
      authorName: String(publication.author_name),
      publishedAt: String(publication.published_at),
      ratingAverage: Number(publication.rating_average ?? 0),
      ratingCount: Number(publication.rating_count ?? 0),
      isFavorite: Boolean(publication.is_favorite),
      myRating: Number(publication.my_rating ?? 0),
    },
    episodes: (episodes.results ?? []) as PublicWorkSnapshot["episodes"],
    comments: (comments.results ?? []) as PublicWorkSnapshot["comments"],
  };
}
