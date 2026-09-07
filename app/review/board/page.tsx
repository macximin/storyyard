import {pageCanaries} from "@/app/firefly-canary-catalog.mjs";
import {CanaryPagination} from "../canary-pagination";
import {listPlanningCanaries} from "@/app/firefly-canaries";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { listFireflyReviewDecisions,listDecisionsForPackets } from "@/app/firefly-review-data";
import { getFireflyReviewArchive, listStoredFireflyReviewPackets, listFireflyReviewPackets } from "@/app/firefly-review-packets";
import { ReviewCollection } from "../collection";

export const dynamic = "force-dynamic";
export const metadata = { title: "검토 칸반 — Storyyard" };
export default async function ReviewKanbanPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const user = await requireChatGPTUser("/review/board");
  if (user.role !== "admin") redirect("/");
  const packets = listFireflyReviewPackets().filter((packet) => !getFireflyReviewArchive(packet.packetId));
  const entries = await Promise.all(packets.map(async (packet) => ({ packet, decisions: await listFireflyReviewDecisions(packet.packetId) })));
  const query=await searchParams, all=await listPlanningCanaries(true);
  const archiveCount=listStoredFireflyReviewPackets().filter(p=>getFireflyReviewArchive(p.packetId)).length+all.filter(c=>c.lifecycle?.archived).length;
  const page=pageCanaries(all.filter(c=>!c.lifecycle?.archived),query);
  const decisions=await listDecisionsForPackets(page.items.map((c:{id:string})=>c.id));
  const canaries=page.items.map((canary:any)=>({canary,decisions:decisions.get(canary.id)||[]}));
  return <ReviewCollection canaries={canaries} user={user} entries={entries} mode="board" archiveCount={archiveCount} controls={<CanaryPagination base="/review/board" {...query} total={page.total} nextCursor={page.nextCursor}/>}/>;
}
