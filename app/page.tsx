import { getChatGPTUser } from "./chatgpt-auth";
import { CommunityHome } from "./community-home";
import { getCommunityPageData } from "./community-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const { setupRequired, works } = await getCommunityPageData({
    userId: user?.id ?? "",
    sort: "rating",
  });
  return (
    <CommunityHome
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={setupRequired}
      initialWorks={works}
    />
  );
}
