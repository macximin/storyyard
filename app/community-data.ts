import { env } from "cloudflare:workers";

export type CommunityWork = {
  id: string;
  slug: string;
  title: string;
  logline: string;
  genre: string;
  coverUrl: string;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
  ratingAverage: number;
  ratingCount: number;
  episodeCount: number;
  isFavorite: boolean;
  rank: number | null;
  ranked: boolean;
};

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

export async function getCommunityWorks({
  userId = "",
  favoritesOnly = false,
  sort = "rating",
}: {
  userId?: string;
  favoritesOnly?: boolean;
  sort?: "rating" | "new";
} = {}): Promise<CommunityWork[]> {
  if (favoritesOnly && !userId) return [];
  const result = await communityQuery({ userId, favoritesOnly }).all<CommunityRow>();
  return sortCommunityWorks(mapCommunityRows((result.results ?? []) as CommunityRow[]), sort);
}

export async function getCommunityPageData({
  userId = "",
  favoritesOnly = false,
  sort = "rating",
}: {
  userId?: string;
  favoritesOnly?: boolean;
  sort?: "rating" | "new";
} = {}): Promise<{ setupRequired: boolean; works: CommunityWork[] }> {
  const [usersResult, worksResult] = await env.DB.batch([
    env.DB.prepare("SELECT id FROM users LIMIT 1"),
    communityQuery({ userId, favoritesOnly }),
  ]);
  return {
    setupRequired: !usersResult.results?.length,
    works: sortCommunityWorks(
      mapCommunityRows((worksResult.results ?? []) as CommunityRow[]),
      sort,
    ),
  };
}

function communityQuery({
  userId,
  favoritesOnly,
}: {
  userId: string;
  favoritesOnly: boolean;
}) {
  const params: unknown[] = [userId];
  const favoriteWhere = favoritesOnly
    ? "AND EXISTS (SELECT 1 FROM publication_favorites pf2 WHERE pf2.publication_id = p.id AND pf2.user_id = ?)"
    : "";
  if (favoritesOnly) params.push(userId);

  return env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.logline, p.genre, p.cover_url, p.author_name,
            p.published_at, p.updated_at,
            COALESCE((SELECT AVG(r.value) FROM ratings r WHERE r.publication_id = p.id), 0) AS rating_average,
            (SELECT COUNT(*) FROM ratings r WHERE r.publication_id = p.id) AS rating_count,
            (SELECT COUNT(*) FROM publication_episodes pe WHERE pe.publication_id = p.id) AS episode_count,
            CASE WHEN EXISTS (
              SELECT 1 FROM publication_favorites pf
              WHERE pf.publication_id = p.id AND pf.user_id = ?
            ) THEN 1 ELSE 0 END AS is_favorite
       FROM publications p
      WHERE p.status = 'published'
      ${favoriteWhere}`,
  ).bind(...params);
}

function mapCommunityRows(rows: CommunityRow[]): CommunityWork[] {
  return rows.map((row) => ({
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
    rank: null,
    ranked: Number(row.rating_count ?? 0) >= 3,
  }));
}

export function sortCommunityWorks(
  works: CommunityWork[],
  sort: "rating" | "new",
): CommunityWork[] {
  const sorted = [...works].sort((left, right) => {
    const publishedDifference =
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    if (sort === "new") return publishedDifference;
    const qualificationDifference = Number(right.ranked) - Number(left.ranked);
    if (qualificationDifference) return qualificationDifference;
    if (left.ranked && right.ranked && right.ratingAverage !== left.ratingAverage) {
      return right.ratingAverage - left.ratingAverage;
    }
    if (right.ratingCount !== left.ratingCount) return right.ratingCount - left.ratingCount;
    return publishedDifference;
  });
  return sorted.map((work, index) => ({
    ...work,
    rank: sort === "rating" ? index + 1 : null,
  }));
}
