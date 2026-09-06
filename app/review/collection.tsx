import type { PlanningCanary } from "../firefly-canaries";
import { CanaryCard } from "./canary-card";
import { GlobalSidebar, type SidebarUser } from "../global-sidebar";
import { reviewDetailHref, reviewKanbanStage, type ReviewArchiveRecord } from "../firefly-review-catalog";
import { fireflyReviewQueueMetadata } from "../firefly-review-display.mjs";
import type { FireflyReviewPacket } from "../firefly-review-contract";

type Decision = { status: string; decision: string; createdAt: string };
export type ReviewCollectionEntry = { packet: FireflyReviewPacket; decisions: Decision[]; archive?: ReviewArchiveRecord; invalidationReason?: string };
const decisions: Record<string, string> = { select: "후보 선택", approve: "승인 의견", hold: "보류", reject: "반려", polish: "수정 요청", tie: "동률", invalid: "무효 의견" };
const columns = [{ id: "waiting", title: "검토 대기", note: "아직 사람 판정이 없는 검토" }, { id: "recorded", title: "판정 기록", note: "선택·보류·반려 의견이 기록된 검토" }, { id: "confirmed", title: "처리 확인", note: "InkOS 처리 영수증까지 확인된 검토" }] as const;

export function ReviewCollection({ user, entries, mode, archiveCount, canaries = [] }: { user: Exclude<SidebarUser, null>; entries: ReviewCollectionEntry[]; mode: "board" | "archive"; archiveCount: number; canaries?: Array<{canary:PlanningCanary;decisions:Decision[]}> }) {
  const ordered = [...entries].sort((a, b) => b.packet.generatedAt.localeCompare(a.packet.generatedAt));
  const visible = ordered.filter((entry) => mode === "archive" ? Boolean(entry.archive) : !entry.archive && !entry.invalidationReason);
  return <main className="library-shell ff-review-collection-shell">
    <GlobalSidebar user={user} active={mode === "board" ? "review-board" : "review-archive"} />
    <section className="ff-review-collection">
      <header><p className="kicker">FIREFLY</p><h1>{mode === "board" ? "검토 칸반" : "검토 보관함"}</h1><p>{mode === "board" ? "기획·HIL의 실제 판정 기록에 따라 상태가 표시됩니다." : "지난 검토의 내용과 코멘트를 다시 읽을 수 있습니다."}</p></header>
      <nav className="ff-review-view-nav" aria-label="검토 보기"><a href="/review">검토 대기</a><a href="/review/board" aria-current={mode === "board" ? "page" : undefined}>검토 칸반</a><a href="/review/archive" aria-current={mode === "archive" ? "page" : undefined}>검토 보관함 <span>{archiveCount}</span></a></nav>
      {mode === "board" ? <div className="ff-review-kanban">{columns.map((column) => {
        const extra = canaries.filter(e => (e.decisions.length ? "recorded" : "waiting") === column.id);
        const items = visible.filter((entry) => reviewKanbanStage(entry.packet, entry.decisions) === column.id);
        return <section key={column.id} className={`ff-review-column ff-review-column-${column.id}`} aria-label={column.title}>
          <header><h2>{column.title}</h2><span>{items.length + extra.length}</span></header><p>{column.note}</p>
          {extra.map(e=><CanaryCard key={e.canary.id} canary={e.canary} decisions={e.decisions}/>)}
          {items.map((entry) => <ReviewCard key={entry.packet.packetId} entry={entry} />)}
          {!items.length && !extra.length && <p className="ff-review-column-empty">해당 검토가 없습니다.</p>}
        </section>;
      })}</div> : <div className="ff-review-archive-list">{visible.map((entry) => <ReviewCard key={entry.packet.packetId} entry={entry} />)}{!visible.length && <p>보관된 검토가 없습니다.</p>}</div>}
    </section>
  </main>;
}

function ReviewCard({ entry }: { entry: ReviewCollectionEntry }) {
  const { packet, archive, invalidationReason } = entry;
  const latest = [...entry.decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return <article className="ff-review-card" id={`packet-${packet.packetId}`}>
    <div className="ff-review-card-meta"><span>{invalidationReason ? "무효 기록" : archive ? "보관" : latest ? decisions[latest.decision] ?? "판정 기록" : "판단 필요"}</span><time dateTime={packet.generatedAt}>{packet.generatedAt.slice(0, 10)}</time></div>
    <h3>{packet.work.title}</h3><p>{fireflyReviewQueueMetadata(packet)}</p>
    <div className="ff-review-card-candidates">{packet.candidates.map((candidate, index) => {
      const rawTitle = "title" in candidate ? candidate.title : "titleCandidates" in candidate ? candidate.titleCandidates[0] : "humanHook" in candidate ? candidate.humanHook : undefined;
      const title = typeof rawTitle === "string" ? rawTitle : undefined;
      return <a key={candidate.id} href={reviewDetailHref(packet.packetId, candidate.id, Boolean(archive))}><span>후보 {String.fromCharCode(65 + index)}</span><strong>{title || packet.artifact.title}</strong></a>;
    })}</div>
    {archive && <p className="ff-review-card-history">판정 기록 {entry.decisions.length}개 · {archive.archivedAt.slice(0, 10)} 보관</p>}
    {invalidationReason && <details><summary>무효 사유</summary><p>{invalidationReason}</p></details>}
  </article>;
}
