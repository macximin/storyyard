export async function executeFoundryWrites(db, writes, { dryRun }) {
  if (dryRun || writes.length === 0) return;
  await db.batch(writes);
}
