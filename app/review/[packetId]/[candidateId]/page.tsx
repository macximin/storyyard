import ReviewPage from "../../page";

export const dynamic = "force-dynamic";
export const metadata = { title: "기획·변주 검토 — Storyyard" };

export default async function LinkedReviewPage({ params }: {
  params: Promise<{ packetId: string; candidateId: string }>;
}) {
  const { packetId, candidateId } = await params;
  return ReviewPage({
    searchParams: Promise.resolve({ packet: packetId, candidate: candidateId }),
    returnPath: `/review/${encodeURIComponent(packetId)}/${encodeURIComponent(candidateId)}`,
  });
}
