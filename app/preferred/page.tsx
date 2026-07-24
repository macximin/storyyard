import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CommunityHome } from "@/app/community-home";
import { getCommunityPageData } from "@/app/community-data";

export const dynamic = "force-dynamic";

export default async function PreferredPage() {
  const user = await getChatGPTUser();
  const { setupRequired, works } = await getCommunityPageData({
    userId: user?.id ?? "",
    favoritesOnly: true,
    sort: "rating",
  });
  return (
    <CommunityHome
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={setupRequired}
      initialWorks={works}
      preferred
    />
  );
}
