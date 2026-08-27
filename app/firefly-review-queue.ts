export function hasAppliedFireflyDecision(decisions: ReadonlyArray<{ status: string }>): boolean {
  return decisions.some((decision) => decision.status === "applied");
}

export function partitionFireflyReviewPackets<T extends { packetId: string }>(
  source: ReadonlyArray<T>,
  decisionsByPacket: Readonly<Record<string, ReadonlyArray<{ status: string }>>>,
): { active: T[]; completed: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  for (const item of source) {
    (hasAppliedFireflyDecision(decisionsByPacket[item.packetId] ?? []) ? completed : active).push(item);
  }
  return { active, completed };
}
