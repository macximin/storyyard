import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fireflyReviewDecisions, fireflyReviewSnapshots } from "@/db/schema";
import type { FireflyReviewPacket } from "./firefly-review-packets";

export async function ensureFireflyReviewSnapshot(packet: FireflyReviewPacket): Promise<void> {
  await getDb().insert(fireflyReviewSnapshots).values({
    packetId: packet.packetId,
    packetSha256: packet.packetSha256,
    schemaVersion: packet.schemaVersion,
    bookId: packet.source.bookId,
    artifactId: packet.artifact.id,
    title: `${packet.work.title} ${packet.artifact.chapterNumber}화`,
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
  return {
    schemaVersion: "firefly_review_decision/v1" as const,
    decisionId: row.id,
    packetId: row.packetId,
    packetSha256: row.packetSha256,
    workId: row.bookId,
    artifactId: row.artifactId,
    candidateId: row.candidateId,
    candidateSha256: row.candidateSha256,
    decision: row.decision,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
    applyReceiptPath: row.applyReceiptPath,
  };
}
