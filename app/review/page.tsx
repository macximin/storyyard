import { notFound, redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ensureFireflyReviewSnapshot, listFireflyReviewDecisions, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { getFireflyReviewArchive, listFireflyReviewPackets } from "@/app/firefly-review-packets";
import { reviewDetailHref } from "@/app/firefly-review-catalog";
import { partitionFireflyReviewPackets } from "@/app/firefly-review-queue";
import { resolvePlanningBaselines } from "@/app/firefly-planning-baseline";
import { resolvePlanningDocuments } from "@/app/firefly-planning-documents";
import planningDocumentIndex from "@/data/firefly/planning-documents/index.json";
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
  if (requestedPacket && getFireflyReviewArchive(requestedPacket)) redirect(requestedCandidate ? reviewDetailHref(requestedPacket, requestedCandidate, true) : `/review/archive?packet=${encodeURIComponent(requestedPacket)}`);
  const requested = packets.find((packet) => packet.packetId === requestedPacket);
  if (requestedPacket && (!requested || (requestedCandidate && !requested.candidates.some((candidate) => candidate.id === requestedCandidate)))) notFound();
  const reviewable = packets.filter((packet) => !getFireflyReviewArchive(packet.packetId));
  await Promise.all(reviewable.map(ensureFireflyReviewSnapshot));
  const decisions = Object.fromEntries(await Promise.all(reviewable.map(async (packet) => [
    packet.packetId,
    (await listFireflyReviewDecisions(packet.packetId)).map(toFireflyReviewDecisionContract),
  ])));
  const queue = partitionFireflyReviewPackets(reviewable, decisions);
  const selectedCompleted = queue.completed.find((packet) => packet.packetId === requestedPacket);
  return <FireflyReviewBoard
    key={`${requestedPacket ?? ""}:${requestedCandidate ?? ""}`}
    user={user}
    packets={selectedCompleted ? [selectedCompleted] : queue.active}
    completed={Boolean(selectedCompleted)}
    planningBaselines={resolvePlanningBaselines(packets, new Set(queue.active.map((packet) => packet.packetId)))}
    planningDocuments={resolvePlanningDocuments(packets, planningDocumentIndex)}
    completedCount={queue.completed.length}
    initialDecisions={decisions}
    initialPacketId={requestedPacket}
    initialCandidateId={requestedCandidate}
  />;
}
