import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProjectWorkspace } from "@/app/project-workspace";
import { getOwnedWorkspace } from "@/app/workspace-data";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/project/${id}/documents`);
  const initialSnapshot = await getOwnedWorkspace(id, user.email);
  return <ProjectWorkspace projectId={id} view="documents" userName={user.displayName} initialSnapshot={initialSnapshot} />;
}
