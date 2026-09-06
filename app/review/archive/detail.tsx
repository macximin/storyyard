import { notFound, redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { listFireflyReviewDecisions, toFireflyReviewDecisionContract } from "@/app/firefly-review-data";
import { getFireflyReviewArchive, getFireflyReviewInvalidation, listStoredFireflyReviewPackets } from "@/app/firefly-review-packets";
import { resolvePlanningBaselines } from "@/app/firefly-planning-baseline";
import { reviewDetailHref } from "@/app/firefly-review-catalog";
import { FireflyReviewBoard } from "../review-board";

export async function ArchivedReviewDetail({ packetId, candidateId }: { packetId: string; candidateId: string }) {
  const user = await requireChatGPTUser(reviewDetailHref(packetId, candidateId, true));
  if (user.role !== "admin") redirect("/");
  const packets = listStoredFireflyReviewPackets();
  const packet = packets.find((item) => item.packetId === packetId);
  const archive = getFireflyReviewArchive(packetId);
  if (!packet || !archive || !packet.candidates.some((candidate) => candidate.id === candidateId)) notFound();
  const decisions = (await listFireflyReviewDecisions(packetId)).map(toFireflyReviewDecisionContract);
  const invalidation = getFireflyReviewInvalidation(packetId);
  return <FireflyReviewBoard user={user} packets={[packet]} completedCount={0} initialPacketId={packetId} initialCandidateId={candidateId} initialDecisions={{ [packetId]: decisions }} planningBaselines={resolvePlanningBaselines(packets, new Set())} archive={{ ...archive, reason: invalidation ? `${archive.reason} 무효 사유: ${invalidation.reason}` : archive.reason, invalidated: Boolean(invalidation) }} />;
}
