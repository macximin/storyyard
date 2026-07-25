import { ProjectWorkspace } from "@/app/project-workspace";
import { requireAuthenticatedWorkspace } from "@/app/workspace-data";

export const dynamic = "force-dynamic";

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, initialSnapshot } = await requireAuthenticatedWorkspace(id, `/project/${id}/characters`);
  return <ProjectWorkspace projectId={id} view="characters" userName={user.displayName} initialSnapshot={initialSnapshot} />;
}
