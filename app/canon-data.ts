import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { canonDecisions, canonSnapshots } from "@/db/schema";
import type { CanonPackage } from "@/app/canon-packages";

export type CanonDecisionRecord = typeof canonDecisions.$inferSelect;

export async function ensureCanonSnapshot(canonPackage: CanonPackage): Promise<void> {
  const db = getDb();
  const [existing] = await db.select({ id: canonSnapshots.id })
    .from(canonSnapshots)
    .where(eq(canonSnapshots.bundleSha256, canonPackage.bundleSha256))
    .limit(1);
  if (existing) return;
  await db.insert(canonSnapshots).values({
    id: crypto.randomUUID(),
    workSlug: canonPackage.workSlug,
    schemaVersion: canonPackage.schemaVersion,
    workflowSchema: canonPackage.workflowSchema,
    bundleSha256: canonPackage.bundleSha256,
    revisionSetSha256: canonPackage.revisionSetSha256,
    title: canonPackage.title,
    payload: JSON.stringify(canonPackage),
    sourcePath: canonPackage.sourcePath,
    sourceUpdatedAt: canonPackage.sourceUpdatedAt,
    importedAt: new Date().toISOString(),
  }).onConflictDoNothing();
}

export async function listCanonDecisions(workSlug: string): Promise<CanonDecisionRecord[]> {
  return getDb().select().from(canonDecisions)
    .where(eq(canonDecisions.workSlug, workSlug))
    .orderBy(desc(canonDecisions.createdAt));
}
