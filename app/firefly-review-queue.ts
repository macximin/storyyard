export function hasAppliedFireflyDecision(decisions: ReadonlyArray<{ status: string }>): boolean {
  return decisions.some((decision) => decision.status === "applied");
}

export function hasAcknowledgedFireflyEvaluation(decisions: ReadonlyArray<{ status: string }>): boolean {
  return decisions.some((decision) => decision.status === "acknowledged");
}

export function hasTerminalFireflyDecision(
  packet: { schemaVersion: string },
  decisions: ReadonlyArray<{ status: string }>,
): boolean {
  return packet.schemaVersion === "firefly_review_packet/v2"
    ? hasAcknowledgedFireflyEvaluation(decisions)
    : hasAppliedFireflyDecision(decisions);
}

export function partitionFireflyReviewPackets<T extends { packetId: string; schemaVersion: string }>(
  source: ReadonlyArray<T>,
  decisionsByPacket: Readonly<Record<string, ReadonlyArray<{ status: string }>>>,
): { active: T[]; completed: T[] } {
  const active: T[] = [];
  const completed: T[] = [];
  for (const item of source) {
    (hasTerminalFireflyDecision(item, decisionsByPacket[item.packetId] ?? []) ? completed : active).push(item);
  }
  return { active, completed };
}
