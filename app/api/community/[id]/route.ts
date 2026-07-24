import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  const publication = await env.DB.prepare(
    `SELECT p.*,
            AVG(r.value) AS rating_average,
            COUNT(DISTINCT r.id) AS rating_count,
            CASE WHEN EXISTS (
              SELECT 1 FROM publication_favorites pf
              WHERE pf.publication_id = p.id AND pf.user_id = ?
            ) THEN 1 ELSE 0 END AS is_favorite,
            (SELECT value FROM ratings mr WHERE mr.publication_id = p.id AND mr.user_id = ?) AS my_rating
       FROM publications p
       LEFT JOIN ratings r ON r.publication_id = p.id
      WHERE (p.id = ? OR p.slug = ?) AND p.status = 'published'
      GROUP BY p.id`,
  ).bind(user?.id ?? "", user?.id ?? "", id, id).first<Record<string, unknown>>();
  if (!publication) return Response.json({ error: "Not found" }, { status: 404 });
  const publicationId = String(publication.id);
  const [episodes, comments] = await Promise.all([
    env.DB.prepare(
      `SELECT id, episode_no, title, body, published_at, updated_at
         FROM publication_episodes WHERE publication_id = ? ORDER BY episode_no ASC`,
    ).bind(publicationId).all(),
    env.DB.prepare(
      `SELECT c.id, c.body, c.created_at, u.display_name, u.username
         FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.publication_id = ? AND c.status = 'visible'
        ORDER BY c.created_at DESC`,
    ).bind(publicationId).all(),
  ]);
  return Response.json({
    work: {
      id: publicationId,
      slug: publication.slug,
      title: publication.title,
      logline: publication.logline,
      genre: publication.genre,
      coverUrl: publication.cover_url,
      authorName: publication.author_name,
      publishedAt: publication.published_at,
      ratingAverage: Number(publication.rating_average ?? 0),
      ratingCount: Number(publication.rating_count ?? 0),
      isFavorite: Boolean(publication.is_favorite),
      myRating: Number(publication.my_rating ?? 0),
    },
    episodes: episodes.results ?? [],
    comments: comments.results ?? [],
  });
}
