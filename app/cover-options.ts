export const COVER_OPTIONS = [
  { key: "first-confirmed", label: "1차 확정 완료", src: "/covers/first-confirmed.png", alt: "1차 확정 완료 표지" },
  { key: "overall-revision", label: "전체 수정 중", src: "/covers/overall-revision.png", alt: "전체 수정 중 표지" },
  { key: "market-testing", label: "시장 테스트 중", src: "/covers/market-testing.png", alt: "시장 테스트 중 표지" },
  { key: "submission-complete", label: "투고 완료", src: "/covers/submission-complete.png", alt: "투고 완료 표지" },
  { key: "launch-complete", label: "런칭 완료", src: "/covers/launch-complete.png", alt: "런칭 완료 표지" },
  { key: "unlimited-contest-expected-pass", label: "무연시 통과 예상", src: "/covers/unlimited-contest-expected-pass.png", alt: "무연시 통과 예상 표지" },
  { key: "kakao-expected-pass", label: "카카오 통과 예상", src: "/covers/kakao-expected-pass.png", alt: "카카오 통과 예상 표지" },
] as const;

export type CoverKey = (typeof COVER_OPTIONS)[number]["key"];

export const DEFAULT_COVER_KEY: CoverKey = "overall-revision";

export function isCoverKey(value: unknown): value is CoverKey {
  return typeof value === "string" && COVER_OPTIONS.some((option) => option.key === value);
}

export function getCoverOption(value: unknown) {
  return COVER_OPTIONS.find((option) => option.key === value)
    ?? COVER_OPTIONS.find((option) => option.key === DEFAULT_COVER_KEY)!;
}

export function resolveCoverSrc(value: unknown): string {
  return getCoverOption(value).src;
}
