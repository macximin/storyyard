import {redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {listPlanningCanaries} from "@/app/firefly-canaries";
import {listFireflyReviewDecisions} from "@/app/firefly-review-data";
import {GlobalSidebar} from "@/app/global-sidebar";
import {CanaryCard} from "../canary-card";
export const dynamic="force-dynamic";export const metadata={title:"기획 비교 — Storyyard"};
export default async function Page(){const user=await requireChatGPTUser("/review/canary");if(user.role!=="admin")redirect("/");const entries=await Promise.all(listPlanningCanaries().map(async c=>({c,decisions:await listFireflyReviewDecisions(c.id)})));return <main className="library-shell ff-review-collection-shell"><GlobalSidebar user={user} active="review"/><section className="ff-review-collection"><header><p className="kicker">FIREFLY</p><h1>현대판타지 기획 비교</h1><p>같은 참고작 세 편과 최신 9절 양식을 전달한 작성 경로별 첫 결과입니다.</p></header><nav className="ff-review-view-nav"><a href="/review/board">검토 칸반</a><a href="/review/board">기존 검토</a></nav><div className="ff-review-archive-list">{entries.map(({c,decisions})=><CanaryCard key={c.id} canary={c} decisions={decisions}/>)}</div></section></main>}
