import { createHash } from "node:crypto";
import type { FireflyReviewPacket } from "./firefly-review-contract";

export type PlanningBaselineView = {
  packetId: string;
  candidateId: string;
  title: string;
  markdown: string;
  reviewHref?: string;
};

// Resolve the exact document on the server. Raw InkOS candidate hashes and
// Storyyard projection candidate hashes have different inputs; do not equate them.
export function resolvePlanningBaselines(
  packets: readonly FireflyReviewPacket[],
  reviewablePacketIds: ReadonlySet<string> = new Set(packets.map((packet) => packet.packetId)),
): Record<string, PlanningBaselineView> {
  const result: Record<string, PlanningBaselineView> = {};
  for (const variation of packets) {
    if (variation.schemaVersion !== "firefly_review_packet/v5") continue;
    const matches = packets.flatMap((packet) => {
      if (packet.schemaVersion !== "firefly_review_packet/v3" || packet.source.slateId !== variation.baseline.slateId) return [];
      const candidate = packet.candidates.find((item) => item.id === variation.baseline.candidateId);
      const plan = candidate?.projectPlan;
      if (!candidate || plan?.format !== "webnovel-project-plan/v1"
        || createHash("sha256").update(plan.markdown, "utf8").digest("hex") !== variation.baseline.planSha256) return [];
      return [{ packet, candidate, plan }];
    }).sort((left, right) => right.packet.generatedAt.localeCompare(left.packet.generatedAt)
      || left.packet.packetId.localeCompare(right.packet.packetId));
    const match = matches[0];
    if (!match) continue;
    result[variation.packetId] = {
      packetId: match.packet.packetId,
      candidateId: match.candidate.id,
      title: variation.baseline.title,
      markdown: match.plan.markdown,
      ...(reviewablePacketIds.has(match.packet.packetId) ? {
        reviewHref: `/review/${encodeURIComponent(match.packet.packetId)}/${encodeURIComponent(match.candidate.id)}`,
      } : {}),
    };
  }
  return result;
}
