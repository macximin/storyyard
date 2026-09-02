export function fireflyReviewQueueMetadata(packet) {
  const rawGenre = packet.work.genre.trim();
  const genre = ({
    "modern-fantasy-ko": "현대판타지",
    "fantasy-ko": "판타지",
    "murim-ko": "무협",
  })[rawGenre] ?? rawGenre;
  if (packet.schemaVersion === "firefly_review_packet/v2") {
    return [genre, "blind 평가", `${packet.comparison.round}/3`].filter(Boolean).join(" · ");
  }
  return [genre, `${packet.candidates.length}개 후보`].filter(Boolean).join(" · ");
}
