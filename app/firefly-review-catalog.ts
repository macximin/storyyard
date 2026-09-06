import { hasTerminalFireflyDecision } from "./firefly-review-queue.ts";

export type ReviewArchiveRecord = { packetId: string; packetSha256: string; archivedAt: string; reason: string };

// Visibility is independent of a human decision or an InkOS receipt.
export function validateReviewArchives(value: unknown, packets: readonly { packetId: string; packetSha256: string }[]): ReviewArchiveRecord[] {
  const registry = value as { schemaVersion?: string; archives?: unknown[] } | null;
  if (registry?.schemaVersion !== "firefly_review_archives/v1" || !Array.isArray(registry.archives)) throw new Error("Invalid review archive registry.");
  const identities = new Map(packets.map((packet) => [packet.packetId, packet.packetSha256]));
  const seen = new Set<string>();
  return registry.archives.map((value) => {
    const item = value as ReviewArchiveRecord;
    if (!item || typeof item.packetId !== "string" || seen.has(item.packetId)
      || typeof item.packetSha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.packetSha256)
      || identities.get(item.packetId) !== item.packetSha256
      || typeof item.archivedAt !== "string" || !Number.isFinite(Date.parse(item.archivedAt))
      || typeof item.reason !== "string" || !item.reason.trim()) throw new Error("Review archive identity or metadata mismatch.");
    seen.add(item.packetId);
    return { packetId: item.packetId, packetSha256: item.packetSha256, archivedAt: item.archivedAt, reason: item.reason };
  });
}

export function reviewKanbanStage(packet: { schemaVersion: string }, decisions: readonly { status: string }[]): "waiting" | "recorded" | "confirmed" {
  if (hasTerminalFireflyDecision(packet, decisions)) return "confirmed";
  return decisions.some((row) => row.status === "pending") ? "recorded" : "waiting";
}

export function reviewDetailHref(packetId: string, candidateId: string, archived = false): string {
  return `/review/${archived ? "archive/" : ""}${encodeURIComponent(packetId)}/${encodeURIComponent(candidateId)}`;
}
