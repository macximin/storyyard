import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fireflyReviewDecisions, fireflyReviewSnapshots } from "@/db/schema";
import type { FireflyReviewPacket } from "./firefly-review-packets";

export async function ensureFireflyReviewSnapshot(packet: FireflyReviewPacket): Promise<void> {
  const planning = packet.schemaVersion === "firefly_review_packet/v3" || packet.schemaVersion === "firefly_review_packet/v4";
  await getDb().insert(fireflyReviewSnapshots).values({
    packetId: packet.packetId,
    packetSha256: packet.packetSha256,
    schemaVersion: packet.schemaVersion,
    bookId: planning ? packet.source.slateId : packet.source.bookId,
    artifactId: packet.artifact.id,
    title: planning ? `${packet.work.title} · 기획 HIL` : `${packet.work.title} ${packet.artifact.chapterNumber}화`,
    payload: JSON.stringify(packet),
    sourceRevision: packet.source.sourceRevision,
    generatedAt: packet.generatedAt,
    importedAt: new Date().toISOString(),
  }).onConflictDoNothing();
}

export async function listFireflyReviewDecisions(packetId: string) {
  return getDb().select().from(fireflyReviewDecisions)
    .where(eq(fireflyReviewDecisions.packetId, packetId))
    .orderBy(desc(fireflyReviewDecisions.createdAt));
}

export type FireflyReviewDecisionRecord = typeof fireflyReviewDecisions.$inferSelect;
export function toFireflyReviewDecisionContract(row: FireflyReviewDecisionRecord) {
  const schemaVersion = row.schemaVersion === "firefly_review_decision/v4"
    ? "firefly_review_decision/v4" as const
    : row.schemaVersion === "firefly_review_decision/v3"
    ? "firefly_review_decision/v3" as const
    : row.schemaVersion === "firefly_review_decision/v2"
      ? "firefly_review_decision/v2" as const
      : "firefly_review_decision/v1" as const;
  const evaluation = schemaVersion === "firefly_review_decision/v2";
  const planning = schemaVersion === "firefly_review_decision/v3";
  const premise = schemaVersion === "firefly_review_decision/v4";
  return {
    schemaVersion,
    decisionId: row.id,
    packetId: row.packetId,
    packetSha256: row.packetSha256,
    workId: row.bookId,
    artifactId: row.artifactId,
    candidateId: evaluation ? row.candidateId || null : row.candidateId,
    candidateSha256: evaluation ? row.candidateSha256 || null : row.candidateSha256,
    decision: row.decision,
    comment: row.comment,
    ...(evaluation
      ? { purpose: "promotion-evaluation" as const, decisionEffect: "advisory" as const, manuscriptApply: false as const }
      : premise
        ? { purpose: "human-premise" as const, decisionEffect: "human-premise-selection" as const, commercialExpansion: false as const, bookCreation: false as const, manuscriptApply: false as const }
      : planning
        ? { purpose: "planning-entry" as const, decisionEffect: "planning-selection" as const, manuscriptApply: false as const }
      : {}),
    ...(evaluation
      ? { surfaceClassifications: parseSurfaceClassifications(row.surfaceClassifications) }
      : {}),
    status: row.status,
    createdAt: row.createdAt,
    ...(evaluation
      ? { acknowledgedAt: row.appliedAt, ackReceiptPath: row.applyReceiptPath }
      : { appliedAt: row.appliedAt, applyReceiptPath: row.applyReceiptPath }),
  };
}

function parseSurfaceClassifications(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
