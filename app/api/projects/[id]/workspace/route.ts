import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getOwnedWorkspace } from "@/app/workspace-data";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  const snapshot = await getOwnedWorkspace(id, user.email);
  if (!snapshot) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(snapshot);
}
