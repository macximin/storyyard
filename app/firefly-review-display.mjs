export function fireflyReviewQueueMetadata(packet) {
  const rawGenre = packet.work.genre.trim();
  const genre = ({
    "modern-fantasy-ko": "현대판타지",
    "fantasy-ko": "판타지",
    "murim-ko": "무협",
  })[rawGenre] ?? rawGenre;
  if (packet.schemaVersion === "firefly_review_packet/v5") {
    return [genre, "초반 구간 변주", `${packet.scope.episodeStart}~${packet.scope.episodeEnd}화`, `${packet.candidates.length}개 후보`].filter(Boolean).join(" · ");
  }
  if (packet.schemaVersion === "firefly_review_packet/v2") {
    return [genre, "blind 평가", `${packet.comparison.round}/3`].filter(Boolean).join(" · ");
  }
  if (packet.schemaVersion === "firefly_review_packet/v3") {
    return [genre, "기획 HIL", `${packet.candidates.length}개 후보`].filter(Boolean).join(" · ");
  }
  if (packet.schemaVersion === "firefly_review_packet/v4") {
    return [genre, "Human Premise HIL", `${packet.candidates.length}개 후보`].filter(Boolean).join(" · ");
  }
  return [genre, `${packet.candidates.length}개 후보`].filter(Boolean).join(" · ");
}
