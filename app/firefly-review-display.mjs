export function fireflyReviewQueueMetadata(packet) {
  const genre = packet.work.genre.trim();
  if (packet.schemaVersion === "firefly_review_packet/v2") {
    return [genre, "blind pair", `${packet.comparison.round}/3`].filter(Boolean).join(" · ");
  }
  return [genre, `${packet.candidates.length}개 후보`].filter(Boolean).join(" · ");
}
