import { ArchivedReviewDetail } from "../../detail";
export const dynamic = "force-dynamic";
export const metadata = { title: "보관된 검토 — Storyyard" };
export default async function Page({ params }: { params: Promise<{ packetId: string; candidateId: string }> }) {
  return ArchivedReviewDetail(await params);
}
