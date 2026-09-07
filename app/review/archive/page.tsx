import {listPlanningCanaries,getPlanningCanaryArchive} from "@/app/firefly-canaries";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { listFireflyReviewDecisions } from "@/app/firefly-review-data";
import { getFireflyReviewArchive, getFireflyReviewInvalidation, listStoredFireflyReviewPackets } from "@/app/firefly-review-packets";
import { reviewDetailHref } from "@/app/firefly-review-catalog";
import { ReviewCollection } from "../collection";

export const dynamic = "force-dynamic";
export const metadata = { title: "검토 보관함 — Storyyard" };
export default async function ReviewArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireChatGPTUser("/review/archive");
  if (user.role !== "admin") redirect("/");
  const query = await searchParams;
  const packets = listStoredFireflyReviewPackets().filter((packet) => getFireflyReviewArchive(packet.packetId));
  const selected = packets.find((packet) => packet.packetId === query.packet);
  if (selected) redirect(reviewDetailHref(selected.packetId, selected.candidates[0].id, true));
  const entries = await Promise.all(packets.map(async (packet) => ({ packet, archive: getFireflyReviewArchive(packet.packetId), invalidationReason: getFireflyReviewInvalidation(packet.packetId)?.reason, decisions: await listFireflyReviewDecisions(packet.packetId) })));
  const canaries=(await listPlanningCanaries(true)).filter(c=>getPlanningCanaryArchive(c.id)).map(canary=>({canary,decisions:[]}));
  return <ReviewCollection canaries={canaries} user={user} entries={entries} mode="archive" archiveCount={packets.length+canaries.length} />;
}

