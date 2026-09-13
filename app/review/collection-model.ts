import { executionDate } from "../firefly-canary-catalog.mjs";
import { reviewDetailHref, reviewKanbanStage, type ReviewArchiveRecord } from "../firefly-review-catalog.ts";
import type { CanarySummary } from "../firefly-canaries";
import type { FireflyReviewPacket } from "../firefly-review-contract";

export type Decision = { status: string; decision: string; createdAt: string };
export type ReviewCollectionEntry = { packet: FireflyReviewPacket; decisions: Decision[]; archive?: ReviewArchiveRecord; invalidationReason?: string };
export type CanaryEntry = { canary: CanarySummary; decisions: Decision[] };
export type CollectionQuery = Record<string, string | string[] | undefined>;
export const decisionLabels: Record<string, string> = { select: "채택 의견", approve: "승인 의견", hold: "보류", reject: "반려", polish: "수정 요청", tie: "동률", invalid: "무효 의견" };
export const collectionStages = [{ id: "waiting", title: "검토 대기" }, { id: "recorded", title: "판정 기록" }, { id: "confirmed", title: "처리 확인" }] as const;
const timestamp = (value: string) => Date.parse(value) || 0;
const latestDecision = (items: Decision[]) => [...items].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))[0];
const recentDate = (...values: (string | undefined)[]) => values.filter((v): v is string => Boolean(v)).sort((a, b) => timestamp(b) - timestamp(a))[0];

export function collectionRows(entries: ReviewCollectionEntry[], canaries: CanaryEntry[], mode: "board" | "archive") {
  const packetRows = entries.filter(e => mode === "archive" ? Boolean(e.archive) : !e.archive && !e.invalidationReason).map(entry => {
    const { packet, archive } = entry;
    const latest = latestDecision(entry.decisions);
    const stage = reviewKanbanStage(packet, entry.decisions);
    const kind = ({ "firefly_review_packet/v3": "기획서", "firefly_review_packet/v4": "전제", "firefly_review_packet/v5": "초반 변주" } as Record<string, string>)[packet.schemaVersion] ?? "원고";
    const links = packet.candidates.map((candidate, index) => {
      const raw = "title" in candidate ? candidate.title : "titleCandidates" in candidate ? candidate.titleCandidates[0] : "humanHook" in candidate ? candidate.humanHook : undefined;
      return { href: reviewDetailHref(packet.packetId, candidate.id, Boolean(archive)), title: typeof raw === "string" ? raw : packet.artifact.title, label: `후보 ${String.fromCharCode(65 + index)}` };
    });
    return { id: `packet-${packet.packetId}`, title: packet.work.title, href: links[0]?.href ?? "/review", links, kind, stage,
      status: entry.invalidationReason ? "invalid" : stage === "confirmed" ? "confirmed" : latest?.decision ?? "waiting",
      statusLabel: entry.invalidationReason ? "무효 기록" : archive ? "보관" : stage === "confirmed" ? "처리 확인" : latest ? decisionLabels[latest.decision] ?? "판정 기록" : "판단 필요",
      date: packet.generatedAt.slice(0, 10), updatedAt: recentDate(packet.generatedAt, latest?.createdAt, archive?.archivedAt), route: "", entry, canaryEntry: undefined as CanaryEntry | undefined };
  });
  const canaryRows = canaries.filter(e => mode === "archive" ? Boolean(e.canary.lifecycle?.archived) : !e.canary.lifecycle?.archived).map(canaryEntry => {
    const c = canaryEntry.canary;
    const latest = latestDecision(canaryEntry.decisions);
    const href = `/review/canary/${encodeURIComponent(c.id)}`;
    return { id: `canary-${c.id}`, title: c.title, href, links: [] as { href: string; title: string; label: string }[], kind: "기획서", stage: latest ? "recorded" : "waiting",
      status: latest?.decision ?? (c.state === "complete" ? "waiting" : c.state),
      statusLabel: c.lifecycle?.archived ? "보관" : latest ? decisionLabels[latest.decision] ?? "판정 기록" : c.state === "running" ? "작성 중" : c.state === "complete" ? "판단 필요" : c.state === "failed" ? "실행 실패" : "양식 확인 필요",
      date: executionDate(c), updatedAt: recentDate(c.generatedAt, latest?.createdAt), route: c.author.route, entry: undefined as ReviewCollectionEntry | undefined, canaryEntry };
  });
  return [...packetRows, ...canaryRows];
}
export type CollectionRow = ReturnType<typeof collectionRows>[number];

export function collectionPage(rows: CollectionRow[], query: CollectionQuery = {}, size = 50) {
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const filters = { q: value("q").trim(), status: value("status"), date: value("date"), route: value("route"), sort: value("sort") || "recent", view: value("view") === "board" ? "board" : "list" };
  const terms = filters.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = rows.filter(row => {
    const search = [row.title, ...row.links.map(link => link.title)].join(" ").toLocaleLowerCase();
    return terms.every(term => search.includes(term)) && (!filters.status || row.stage === filters.status || row.status === filters.status)
      && (!filters.date || row.date === filters.date) && (!filters.route || row.route === filters.route);
  }).sort((a, b) => (filters.sort === "title" ? a.title.localeCompare(b.title, "ko") : filters.sort === "oldest" ? timestamp(a.updatedAt) - timestamp(b.updatedAt) : timestamp(b.updatedAt) - timestamp(a.updatedAt)) || a.id.localeCompare(b.id));
  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const requested = Number(value("page"));
  const page = Math.min(pageCount, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  return { filters, items: filtered.slice((page - 1) * size, page * size), total: rows.length, filteredTotal: filtered.length, page, pageCount };
}

export function collectionHref(base: string, filters: Record<string, string>, changes: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) if (value && !(key === "view" && value === "list") && !(key === "sort" && value === "recent")) params.set(key, value);
  return `${base}${params.size ? `?${params}` : ""}`;
}
