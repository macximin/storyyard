import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProjectWorkspace } from "@/app/project-workspace";

export const dynamic = "force-dynamic";

export default async function ManuscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/project/${id}/manuscript`);
  return <ProjectWorkspace projectId={id} view="manuscript" userName={user.displayName} />;
}
