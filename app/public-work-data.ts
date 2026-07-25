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
    published_at: string;
    updated_at: string;
  }>;
  comments: Array<{
    id: string;
    user_id: string;
    body: string;
    created_at: string;
    display_name: string;
    username: string;
  }>;
  content: Array<{
    sourceId: string;
    kind: string;
    parentSourceId: string;
    sortOrder: number;
    title: string;
    body: string;
    meta: string;
  }>;
};

export async function getPublicWork(
  idOrSlug: string,
  userId = "",
): Promise<PublicWorkSnapshot | null> {
  const [publicationResult, episodesResult, commentsResult, contentResult] = await env.DB.batch([
    env.DB.prepare(
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
    ).bind(userId, userId, idOrSlug, idOrSlug),
    env.DB.prepare(
      `SELECT id, episode_no, title, published_at, updated_at
         FROM publication_episodes
        WHERE publication_id = (
          SELECT id FROM publications
           WHERE (id = ? OR slug = ?) AND status = 'published'
        )
        ORDER BY episode_no ASC`,
    ).bind(idOrSlug, idOrSlug),
    env.DB.prepare(
      `SELECT c.id, c.user_id, c.body, c.created_at, u.display_name, u.username
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.publication_id = (
          SELECT id FROM publications
           WHERE (id = ? OR slug = ?) AND status = 'published'
        )
          AND c.episode_id IS NULL
          AND c.status = 'visible'
        ORDER BY c.created_at DESC`,
    ).bind(idOrSlug, idOrSlug),
    env.DB.prepare(
      `SELECT source_id AS "sourceId", kind, parent_source_id AS "parentSourceId",
              sort_order AS "sortOrder", title, body, meta
         FROM publication_content
        WHERE publication_id = (
          SELECT id FROM publications
           WHERE (id = ? OR slug = ?) AND status = 'published'
        )
        ORDER BY kind ASC, sort_order ASC`,
    ).bind(idOrSlug, idOrSlug),
  ]);
  const publication = publicationResult.results?.[0] as Record<string, unknown> | undefined;
  if (!publication) return null;

  const publicationId = String(publication.id);

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
    episodes: (episodesResult.results ?? []) as PublicWorkSnapshot["episodes"],
    comments: (commentsResult.results ?? []) as PublicWorkSnapshot["comments"],
    content: (contentResult.results ?? []) as PublicWorkSnapshot["content"],
  };
}
