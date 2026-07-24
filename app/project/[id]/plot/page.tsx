import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProjectWorkspace } from "@/app/project-workspace";

export const dynamic = "force-dynamic";

export default async function PlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/project/${id}/plot`);
  return <ProjectWorkspace projectId={id} view="plot" userName={user.displayName} />;
}
