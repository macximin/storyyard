import {redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {listPlanningCanaries} from "@/app/firefly-canaries";
import {listFireflyReviewDecisions} from "@/app/firefly-review-data";
import {GlobalSidebar} from "@/app/global-sidebar";
import {CanaryCard} from "../canary-card";
export const dynamic="force-dynamic";export const metadata={title:"기획 비교 — Storyyard"};
export default async function Page(){const user=await requireChatGPTUser("/review/canary");if(user.role!=="admin")redirect("/");const entries=await Promise.all((await listPlanningCanaries()).map(async c=>({c,decisions:await listFireflyReviewDecisions(c.id)})));return <main className="library-shell ff-review-collection-shell"><GlobalSidebar user={user} active="review"/><section className="ff-review-collection"><header><p className="kicker">FIREFLY</p><h1>기획 실행 결과</h1><p>실행별 기획서와 영수증입니다. 각 기획서의 참고작·작성 경로를 확인해 주세요.</p></header><nav className="ff-review-view-nav"><a href="/review/board">검토 칸반</a><a href="/review/board">기존 검토</a></nav><div className="ff-review-archive-list">{entries.map(({c,decisions})=><CanaryCard key={c.id} canary={c} decisions={decisions}/>)}</div></section></main>}
