import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getPublicWork } from "@/app/public-work-data";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  const { id } = await context.params;
  const snapshot = await getPublicWork(id, user?.id ?? "");
  if (!snapshot) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(snapshot);
}
