import { BulkReviewActions, BulkReviewCheckbox } from "./bulk-review-actions";
import { GlobalSidebar, type SidebarUser } from "../global-sidebar";
import { CanaryCard } from "./canary-card";
import { fireflyReviewQueueMetadata } from "../firefly-review-display.mjs";
import { collectionRows, collectionPage, collectionHref, collectionStages, type ReviewCollectionEntry, type CanaryEntry, type CollectionQuery, type CollectionRow } from "./collection-model.ts";
export type { ReviewCollectionEntry } from "./collection-model.ts";

export function ReviewCollection({ user, entries, mode, archiveCount, canaries = [], query = {} }: { user: Exclude<SidebarUser, null>; entries: ReviewCollectionEntry[]; mode: "board" | "archive"; archiveCount: number; canaries?: CanaryEntry[]; query?: CollectionQuery }) {
  const rows = collectionRows(entries, canaries, mode);
  const { filters, items, total, filteredTotal, page, pageCount } = collectionPage(rows, query);
  const base = mode === "archive" ? "/review/archive" : "/review/board";
  const routes = [...new Set(rows.map(row => row.route).filter(Boolean))].sort();
  const board = filters.view === "board";
  return <main className="library-shell ff-review-collection-shell">
    <GlobalSidebar user={user} active={mode === "board" ? "review-board" : "review-archive"} />
    <section className="ff-review-collection">
      <header><p className="kicker">FIREFLY</p><h1>{mode === "board" ? "검토 목록" : "검토 보관함"}</h1><p>작품을 빠르게 찾고, 제목을 눌러 내용과 검토 기록을 읽으세요.</p></header>
      <nav className="ff-review-view-nav" aria-label="검토 보기"><a href="/review">검토 대기</a><a href="/review/board" aria-current={mode === "board" ? "page" : undefined}>검토 목록</a><a href="/review/archive" aria-current={mode === "archive" ? "page" : undefined}>보관함 <span>{archiveCount}</span></a></nav>
      <form className="ff-collection-filters" action={base} method="get">
        {board && <input type="hidden" name="view" value="board" />}
        <label className="ff-collection-search">작품 검색<input type="search" name="q" defaultValue={filters.q} placeholder="작품명 또는 후보 제목" /></label>
        <label>상태<select name="status" defaultValue={filters.status}><option value="">전체 상태</option>{collectionStages.map(stage => <option key={stage.id} value={stage.id}>{stage.title}</option>)}<option value="select">채택 의견</option><option value="hold">보류</option><option value="reject">반려</option><option value="running">작성 중</option><option value="failed">실행 실패</option><option value="invalid">무효 기록</option></select></label>
        <label>정렬<select name="sort" defaultValue={filters.sort}><option value="recent">최근 기록순</option><option value="oldest">오래된 기록순</option><option value="title">작품명순</option></select></label>
        <button type="submit">검색</button><a className="ff-collection-reset" href={collectionHref(base, { view: filters.view })}>초기화</a>
        <details className="ff-collection-extra" open={Boolean(filters.date || filters.route)}><summary>날짜·작성 경로{(filters.date || filters.route) && " · 적용 중"}</summary><div><label>작성일<input type="date" name="date" defaultValue={filters.date} /></label><label>작성 경로<select name="route" defaultValue={filters.route}><option value="">전체 경로</option>{routes.map(route => <option key={route} value={route}>{route}</option>)}</select></label></div></details>
      </form>
      <div className="ff-collection-toolbar"><p><strong>{filteredTotal}건</strong>{filteredTotal !== total && <> / 전체 {total}건</>}{pageCount > 1 && <> · {page} / {pageCount}페이지</>}</p><nav className="ff-collection-view" aria-label="목록 표시 방식"><a href={collectionHref(base, filters, { view: "list" })} aria-current={!board ? "page" : undefined}>목록</a><a href={collectionHref(base, filters, { view: "board" })} aria-current={board ? "page" : undefined}>칸반</a></nav></div>
      {!items.length ? <div className="ff-collection-empty"><h2>조건에 맞는 검토가 없습니다</h2><p>검색어나 필터를 바꿔 보세요.</p><a href={base}>전체 목록 보기</a></div> : board ? <div className="ff-review-kanban">{collectionStages.map(column => {
        const group = items.filter(row => row.stage === column.id);
        return <section key={column.id} className={`ff-review-column ff-review-column-${column.id}`} aria-label={column.title}><header><h2>{column.title}</h2><span>{group.length}{pageCount > 1 ? " · 현재 페이지" : ""}</span></header>{group.map(row => row.canaryEntry ? <CanaryCard key={row.id} {...row.canaryEntry} /> : <ReviewCard key={row.id} row={row} />)}{!group.length && <p className="ff-review-column-empty">해당 검토가 없습니다.</p>}</section>;
      })}</div> : <BulkReviewActions key={collectionHref(base, filters, {page:String(page)})} archived={mode === "archive"} items={items.flatMap(row => { const c=row.canaryEntry?.canary; return c?.inputSha256 && c.outputSha256 ? [{id:c.id,title:c.title,inputSha256:c.inputSha256,outputSha256:c.outputSha256,running:c.state === "running"}] : []; })}><div className="ff-collection-table-wrap"><table className="ff-collection-table"><caption className="ff-visually-hidden">{mode === "archive" ? "보관된 검토" : "검토 목록"}, {filteredTotal}건</caption><thead><tr><th scope="col" className="ff-collection-select">선택</th><th scope="col">상태</th><th scope="col">작품명</th><th scope="col">구분</th><th scope="col">최근 기록</th></tr></thead><tbody>{items.map(row => <tr key={row.id} id={row.id}><td className="ff-collection-select">{row.canaryEntry?.canary.inputSha256 && row.canaryEntry.canary.outputSha256 ? <BulkReviewCheckbox id={row.canaryEntry.canary.id} title={row.title}/> : <span title="후보별 판정이 필요한 검토입니다. 제목을 눌러 개별 검토해 주세요.">개별</span>}</td><td><span className={`ff-status ff-status-${row.stage}`} data-status={row.status}>{row.statusLabel}</span></td><td className="ff-collection-title"><div><a className="ff-collection-title-link" href={row.href} title={row.title}>{row.title}</a>{row.links.length > 1 && <details className="ff-collection-candidates"><summary aria-label={`${row.title} 후보 ${row.links.length}개 보기`}>후보 {row.links.length}</summary><div>{row.links.map(link => <a key={link.href} href={link.href}>{link.label} · {link.title}</a>)}</div></details>}</div></td><td className="ff-collection-kind">{row.kind}</td><td className="ff-collection-date"><time dateTime={row.updatedAt}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.updatedAt))}</time></td></tr>)}</tbody></table></div></BulkReviewActions>}
      {pageCount > 1 && <nav className="ff-collection-pagination" aria-label="검토 목록 페이지">{page > 1 && <a href={collectionHref(base, filters, { page: String(page - 1) })}>← 이전</a>}<span>{page} / {pageCount}</span>{page < pageCount && <a href={collectionHref(base, filters, { page: String(page + 1) })}>다음 →</a>}</nav>}
    </section>
  </main>;
}

function ReviewCard({ row }: { row: CollectionRow }) {
  const entry = row.entry!;
  return <article className="ff-review-card" id={row.id}><div className="ff-review-card-meta"><span>{row.statusLabel}</span><time dateTime={row.updatedAt}>{row.updatedAt.slice(0, 10)}</time></div><h3>{row.title}</h3><p>{fireflyReviewQueueMetadata(entry.packet)}</p><div className="ff-review-card-candidates">{row.links.map(link => <a key={link.href} href={link.href}><span>{link.label}</span><strong>{link.title}</strong></a>)}</div>{entry.archive && <p className="ff-review-card-history">판정 기록 {entry.decisions.length}개 · {entry.archive.archivedAt.slice(0, 10)} 보관</p>}{entry.invalidationReason && <details><summary>무효 사유</summary><p>{entry.invalidationReason}</p></details>}</article>;
}
