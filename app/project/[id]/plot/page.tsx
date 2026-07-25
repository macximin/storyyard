import { listSyncableCanonPackages } from "@/app/canon-packages";
import { ProjectWorkspace, type FoundryPackageSummary } from "@/app/project-workspace";
import { requireAuthenticatedWorkspace } from "@/app/workspace-data";

export const dynamic = "force-dynamic";

export default async function PlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, initialSnapshot } = await requireAuthenticatedWorkspace(id, `/project/${id}/plot`);
  const initialFoundryPackages: FoundryPackageSummary[] = user.role === "admin"
    ? listSyncableCanonPackages().map((canonPackage) => ({
      workSlug: canonPackage.workSlug,
      title: canonPackage.title,
      sourceCommit: canonPackage.sourceGitCommit,
      bundleSha256: canonPackage.bundleSha256,
      currentEpisode: canonPackage.status.currentEpisode,
      currentBArc: canonPackage.status.currentBArc,
    }))
    : [];
  return (
    <ProjectWorkspace
      projectId={id}
      view="plot"
      userName={user.displayName}
      initialSnapshot={initialSnapshot}
      initialFoundryPackages={initialFoundryPackages}
    />
  );
}
