import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { Library } from "@/app/library";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await requireChatGPTUser("/studio");
  return <Library user={{ id: user.id, username: user.username, displayName: user.displayName, role: user.role }} />;
}
