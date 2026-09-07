import {listPlanningCanaries,getPlanningCanaryArchive} from "@/app/firefly-canaries";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { listFireflyReviewDecisions } from "@/app/firefly-review-data";
import { getFireflyReviewArchive, listStoredFireflyReviewPackets, listFireflyReviewPackets } from "@/app/firefly-review-packets";
import { ReviewCollection } from "../collection";

export const dynamic = "force-dynamic";
export const metadata = { title: "검토 칸반 — Storyyard" };
export default async function ReviewKanbanPage() {
  const user = await requireChatGPTUser("/review/board");
  if (user.role !== "admin") redirect("/");
  const packets = listFireflyReviewPackets().filter((packet) => !getFireflyReviewArchive(packet.packetId));
  const entries = await Promise.all(packets.map(async (packet) => ({ packet, decisions: await listFireflyReviewDecisions(packet.packetId) })));
  const canaryArchiveCount=(await listPlanningCanaries(true)).filter(c=>getPlanningCanaryArchive(c.id)).length;
  const archiveCount = listStoredFireflyReviewPackets().filter((packet) => getFireflyReviewArchive(packet.packetId)).length + canaryArchiveCount;
  const canaries = await Promise.all((await listPlanningCanaries()).map(async canary=>({canary,decisions:await listFireflyReviewDecisions(canary.id)})));
  return <ReviewCollection canaries={canaries} user={user} entries={entries} mode="board" archiveCount={archiveCount} />;
}
