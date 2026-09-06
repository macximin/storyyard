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
  const archiveCount = listStoredFireflyReviewPackets().filter((packet) => getFireflyReviewArchive(packet.packetId)).length;
  return <ReviewCollection user={user} entries={entries} mode="board" archiveCount={archiveCount} />;
}
