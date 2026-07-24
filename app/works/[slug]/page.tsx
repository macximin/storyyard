import { getChatGPTUser } from "@/app/chatgpt-auth";
import { PublicWork } from "@/app/public-work";
import { getPublicWork } from "@/app/public-work-data";

export const dynamic = "force-dynamic";

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getChatGPTUser();
  const initialSnapshot = await getPublicWork(slug, user?.id ?? "");
  return (
    <PublicWork
      user={user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null}
      setupRequired={false}
      initialSnapshot={initialSnapshot}
    />
  );
}
