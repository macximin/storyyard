import { ProjectWorkspace } from "@/app/project-workspace";
import { requireAuthenticatedWorkspace } from "@/app/workspace-data";

export const dynamic = "force-dynamic";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, initialSnapshot } = await requireAuthenticatedWorkspace(id, `/project/${id}`);
  return <ProjectWorkspace projectId={id} view="overview" userName={user.displayName} initialSnapshot={initialSnapshot} />;
}
