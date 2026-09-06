import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureFireflyReviewSnapshot, listFireflyReviewDecisions, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { listFireflyReviewPackets } from "@/app/firefly-review-packets";
import { partitionFireflyReviewPackets } from "@/app/firefly-review-queue";
import { FireflyReviewBoard } from "./review-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "검토 대기 — Storyyard" };

export default async function ReviewPage({ searchParams, returnPath }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  returnPath?: string;
}) {
  const query = await searchParams;
  const requestedPacket = typeof query.packet === "string" ? query.packet : undefined;
  const requestedCandidate = typeof query.candidate === "string" ? query.candidate : undefined;
  const returnQuery = new URLSearchParams();
  if (requestedPacket) returnQuery.set("packet", requestedPacket);
  if (requestedCandidate) returnQuery.set("candidate", requestedCandidate);
  const encodedQuery = returnQuery.toString();
  const returnTo = returnPath ?? (encodedQuery ? `/review?${encodedQuery}` : "/review");
  const user = await requireChatGPTUser(returnTo);
  if (user.role !== "admin") redirect("/");
  const packets = listFireflyReviewPackets();
  await Promise.all(packets.map(ensureFireflyReviewSnapshot));
  const decisions = Object.fromEntries(await Promise.all(packets.map(async (packet) => [
    packet.packetId,
    (await listFireflyReviewDecisions(packet.packetId)).map(toFireflyReviewDecisionContract),
  ])));
  const queue = partitionFireflyReviewPackets(packets, decisions);
  return <FireflyReviewBoard
    key={`${requestedPacket ?? ""}:${requestedCandidate ?? ""}`}
    user={user}
    packets={queue.active}
    completedCount={queue.completed.length}
    initialDecisions={decisions}
    initialPacketId={requestedPacket}
    initialCandidateId={requestedCandidate}
  />;
}
