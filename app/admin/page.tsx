import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AdminClient } from "./admin-client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  if (user.role !== "admin") redirect("/");
  return <AdminClient user={{ id: user.id, username: user.username, displayName: user.displayName, role: user.role }} />;
}
