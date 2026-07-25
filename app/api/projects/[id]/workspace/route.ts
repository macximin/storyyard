import { getAuthenticatedWorkspace } from "@/app/workspace-data";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, snapshot } = await getAuthenticatedWorkspace(id);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!snapshot) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(snapshot);
}
