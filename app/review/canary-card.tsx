import {executionDate} from "../firefly-canary-catalog.mjs";
import type {CanarySummary} from "../firefly-canaries";
export function CanaryCard({canary:c,decisions=[]}:{canary:CanarySummary;decisions?:Array<{decision:string}>}) {
 const archive=c.lifecycle?.archived?c.lifecycle:undefined;
 const label:Record<string,string>={select:"채택 의견",hold:"보류",reject:"반려"};
 return <article className="ff-review-card"><div className="ff-review-card-meta"><span>{archive?"보관":decisions.length?label[decisions[0].decision]:c.state==="running"?"작성 중":c.state==="complete"?"판단 필요":c.state==="failed"?"실행 실패":"양식 확인 필요"}</span><time>{executionDate(c)}</time></div><h3><a href={`/review/canary/${c.id}`}>{c.title}</a></h3>{archive && <p>{archive.reason}{archive.replacementId && <> · <a href={`/review/canary/${archive.replacementId}`}>복구된 기획서</a></>}</p>}<p>{c.author.route} · {c.author.model} · {c.author.reasoning}</p><p>현대판타지 · 동일 입력 비교</p><div className="ff-review-card-candidates"><a href={`/review/canary/${c.id}`}><strong>{c.state==="running"?"작성 진행 확인":"기획서 읽고 판정"}</strong></a><a href={`/review/canary/${c.id}#receipt`}>실행 영수증</a></div></article>;
}
