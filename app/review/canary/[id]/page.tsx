import {notFound,redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {getPlanningCanary} from "@/app/firefly-canaries";
import {listFireflyReviewDecisions} from "@/app/firefly-review-data";
import {GlobalSidebar} from "@/app/global-sidebar";
import {PlanningProjectPlan} from "../../planning-evidence";
import {CanaryReceipt} from "../../canary-receipt";
import {CanaryDecision} from "../../canary-decision";
export const dynamic="force-dynamic";
export const metadata={title:"기획 카나리 검토 — Storyyard"};
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const user=await requireChatGPTUser(`/review/canary/${id}`);if(user.role!=="admin")redirect("/");const c=getPlanningCanary(id);if(!c)notFound();const decisions=await listFireflyReviewDecisions(id);
 return <main className="library-shell ff-review-collection-shell"><GlobalSidebar user={user} active="review-board"/><section className="ff-review-collection"><nav className="ff-review-view-nav"><a href="/review/board">← 검토 칸반</a><a href="/review/canary">이번 기획 비교 전체</a><a href="#receipt">실행 영수증</a></nav><header><p className="kicker">FIREFLY · 현대판타지 기획 비교</p><h1>{c.title}</h1><p>작성: {c.author.route} · {c.author.model} · {c.author.reasoning}</p></header>{c.issues.length>0&&<aside className="commercial-promise-card"><h2>확인할 부분</h2><ul>{c.issues.map(i=><li key={i}>{i}</li>)}</ul></aside>}{c.reviewNotes?.length?<details className="commercial-promise-card"><summary>운영자 검토 메모 · {c.reviewNotes.length}개</summary><ul>{c.reviewNotes.map(note=><li key={note}>{note}</li>)}</ul></details>:null}{c.state==="running"?<p>작성 서비스에서 응답을 생성하고 있습니다. 완료되면 본문과 영수증을 갱신합니다.</p>:c.markdown?<PlanningProjectPlan markdown={c.markdown} title={c.title}/>:<p>이 경로는 기획서 응답을 받지 못했습니다. 아래 영수증에서 실패 원인을 확인할 수 있습니다.</p>}{c.state!=="running"&&<CanaryDecision id={id} inputSha256={c.inputSha256} outputSha256={c.outputSha256} complete={c.state==="complete"}/>}<section className="commercial-promise-card"><h2>HIL 기록 {decisions.length}개</h2>{decisions.map(d=><article key={d.id}><strong>{{select:"채택 의견",hold:"보류",reject:"반려"}[d.decision]??d.decision}</strong><time> · {d.createdAt}</time><p style={{whiteSpace:"pre-wrap"}}>{d.comment||"코멘트 없음"}</p></article>)}</section><CanaryReceipt canary={c}/></section></main>;
}
