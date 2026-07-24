import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getCommunityWorks } from "@/app/community-data";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") === "new" ? "new" : "rating";
  const favoritesOnly = url.searchParams.get("favorites") === "1";
  if (favoritesOnly && !user) {
    return Response.json({ error: "로그인이 필요함." }, { status: 401 });
  }
  const works = await getCommunityWorks({
    userId: user?.id ?? "",
    favoritesOnly,
    sort,
  });
  return Response.json({ works });
}
