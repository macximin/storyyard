import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureFireflyReviewSnapshot, listFireflyReviewDecisions, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { listFireflyReviewPackets } from "@/app/firefly-review-packets";
import { partitionFireflyReviewPackets } from "@/app/firefly-review-queue";
import { FireflyReviewBoard } from "./review-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "검토 대기 — Storyyard" };

export default async function ReviewPage() {
  const user = await requireChatGPTUser("/review");
  if (user.role !== "admin") redirect("/");
  const packets = listFireflyReviewPackets();
  await Promise.all(packets.map(ensureFireflyReviewSnapshot));
  const decisions = Object.fromEntries(await Promise.all(packets.map(async (packet) => [
    packet.packetId,
    (await listFireflyReviewDecisions(packet.packetId)).map(toFireflyReviewDecisionContract),
  ])));
  const queue = partitionFireflyReviewPackets(packets, decisions);
  return <FireflyReviewBoard
    user={user}
    packets={queue.active}
    completedCount={queue.completed.length}
    initialDecisions={decisions}
  />;
}
