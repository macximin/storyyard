import { createHash } from "node:crypto";
import { variationReviewHash } from "./firefly-variation-review-contract.ts";
import type { FireflyReviewPacket } from "./firefly-review-contract";

export type PlanningDocument = {
  candidateId: string; candidateSha256: string;
  projectPlan: { format: "webnovel-project-plan/v1"; markdown: string };
  projectPlanSha256: string;
};
export type PlanningDocuments = Record<string, Record<string, PlanningDocument>>;
type DocumentExport = {
  schemaVersion: "inkos-variation-project-plans/v1"; sourceSystem: "inkos";
  packetId: string; packetSha256: string; generatedAt: string;
  basis: "existing-candidates-and-owner-format-request"; plans: PlanningDocument[]; sha256: string;
};

// InkOS authors the plan. Storyyard only verifies and displays that exact text.
export function resolvePlanningDocuments(packets: readonly FireflyReviewPacket[], value: unknown): PlanningDocuments {
  if (!Array.isArray(value)) throw new Error("Planning document index must be an array.");
  const result: PlanningDocuments = {};
  for (const input of value) {
    const document = input as DocumentExport;
    if (!document || document.schemaVersion !== "inkos-variation-project-plans/v1" || document.sourceSystem !== "inkos"
      || document.basis !== "existing-candidates-and-owner-format-request" || !Array.isArray(document.plans)
      || !Number.isFinite(Date.parse(document.generatedAt))) throw new Error("Invalid InkOS planning document export.");
    const { sha256, ...unsigned } = document;
    if (variationReviewHash(unsigned) !== sha256) throw new Error("Planning document export SHA mismatch.");
    const packet = packets.find((item) => item.packetId === document.packetId);
    if (!packet) continue;
    if (packet.schemaVersion !== "firefly_review_packet/v5" || packet.packetSha256 !== document.packetSha256) throw new Error("Planning document packet mismatch.");
    if (result[packet.packetId]) throw new Error("Duplicate planning document export.");
    const plans: Record<string, PlanningDocument> = {};
    for (const plan of document.plans) {
      const candidate = packet.candidates.find((item) => item.id === plan.candidateId);
      if (!candidate || candidate.sha256 !== plan.candidateSha256 || plans[plan.candidateId]) throw new Error("Planning document candidate mismatch.");
      if (plan.projectPlan?.format !== "webnovel-project-plan/v1" || typeof plan.projectPlan.markdown !== "string") throw new Error("Planning document format mismatch.");
      const markdown = plan.projectPlan.markdown;
      if (markdown.length < 600 || markdown.length > 30_000 || createHash("sha256").update(markdown, "utf8").digest("hex") !== plan.projectPlanSha256) throw new Error("Planning document body SHA mismatch.");
      const sections = [...markdown.matchAll(/^#{1,2}\s+(\d+)\.\s+(.+)$/gmu)];
      if (sections.length !== 9 || sections.some((section, index) => Number(section[1]) !== index + 1)) throw new Error("Planning document requires the agreed nine sections.");
      const sixWs = markdown.slice(sections[1].index, sections[2].index);
      if (!["WHO", "WHAT", "HOW", "WHERE", "WHEN", "WHY"].every((label) => new RegExp(`\\b${label}\\b`, "u").test(sixWs))) throw new Error("Planning document requires all six questions in section two.");
      plans[plan.candidateId] = plan;
    }
    if (Object.keys(plans).length !== packet.candidates.length) throw new Error("Planning documents must cover every current candidate.");
    result[packet.packetId] = plans;
  }
  return result;
}
