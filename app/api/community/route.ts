import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type CommunityRow = {
  id: string;
  slug: string;
  title: string;
  logline: string;
  genre: string;
  cover_url: string;
  author_name: string;
  published_at: string;
  updated_at: string;
  rating_average: number | null;
  rating_count: number;
  episode_count: number;
  is_favorite: number;
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") === "new" ? "new" : "rating";
  const favoritesOnly = url.searchParams.get("favorites") === "1";
  if (favoritesOnly && !user) return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  const params: unknown[] = [user?.id ?? ""];
  const favoriteWhere = favoritesOnly
    ? "AND EXISTS (SELECT 1 FROM publication_favorites pf2 WHERE pf2.publication_id = p.id AND pf2.user_id = ?)"
    : "";
  if (favoritesOnly) params.push(user!.id);
  const orderBy = sort === "new"
    ? "p.published_at DESC, p.updated_at DESC"
    : "CASE WHEN COUNT(r.id) >= 3 THEN AVG(r.value) ELSE -1 END DESC, COUNT(r.id) DESC, p.published_at DESC";
  const result = await env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.logline, p.genre, p.cover_url, p.author_name,
            p.published_at, p.updated_at,
            AVG(r.value) AS rating_average,
            COUNT(DISTINCT r.id) AS rating_count,
            COUNT(DISTINCT pe.id) AS episode_count,
            CASE WHEN EXISTS (
              SELECT 1 FROM publication_favorites pf
              WHERE pf.publication_id = p.id AND pf.user_id = ?
            ) THEN 1 ELSE 0 END AS is_favorite
       FROM publications p
       LEFT JOIN ratings r ON r.publication_id = p.id
       LEFT JOIN publication_episodes pe ON pe.publication_id = p.id
      WHERE p.status = 'published'
      ${favoriteWhere}
      GROUP BY p.id
      ORDER BY ${orderBy}`,
  ).bind(...params).all<CommunityRow>();
  const rows = (result.results ?? []) as CommunityRow[];
  return Response.json({
    works: rows.map((row, index) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      logline: row.logline,
      genre: row.genre,
      coverUrl: row.cover_url,
      authorName: row.author_name,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      ratingAverage: Number(row.rating_average ?? 0),
      ratingCount: Number(row.rating_count ?? 0),
      episodeCount: Number(row.episode_count ?? 0),
      isFavorite: Boolean(row.is_favorite),
      rank: sort === "rating" ? index + 1 : null,
      ranked: Number(row.rating_count ?? 0) >= 3,
    })),
  });
}
