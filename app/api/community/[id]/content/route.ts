import { env } from "cloudflare:workers";

const kindsByType = {
  characters: ["character"],
  documents: ["document"],
  plots: ["plot", "act", "block"],
} as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const type = new URL(request.url).searchParams.get("type") as keyof typeof kindsByType | null;
  if (!type || !(type in kindsByType)) return Response.json({ error: "공개 정보 종류가 올바르지 않음." }, { status: 400 });

  const kinds = kindsByType[type];
  const placeholders = kinds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT pc.source_id AS "sourceId", pc.kind, pc.parent_source_id AS "parentSourceId",
            pc.sort_order AS "sortOrder", pc.title, pc.body, pc.meta
       FROM publication_content pc
       JOIN publications p ON p.id = pc.publication_id
      WHERE pc.publication_id = ? AND p.status = 'published' AND pc.kind IN (${placeholders})
      ORDER BY CASE pc.kind WHEN 'plot' THEN 1 WHEN 'act' THEN 2 WHEN 'block' THEN 3 ELSE 1 END,
               pc.sort_order ASC`,
  ).bind(id, ...kinds).all();
  return Response.json({ content: result.results ?? [] });
}
