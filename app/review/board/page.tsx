import {listPlanningCanaries} from "@/app/firefly-canaries";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { listFireflyReviewDecisions,listDecisionsForPackets } from "@/app/firefly-review-data";
import { getFireflyReviewArchive, listStoredFireflyReviewPackets, listFireflyReviewPackets } from "@/app/firefly-review-packets";
import { ReviewCollection } from "../collection";

export const dynamic = "force-dynamic";
export const metadata = { title: "검토 목록 — Storyyard" };
export default async function ReviewKanbanPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const user = await requireChatGPTUser("/review/board");
  if (user.role !== "admin") redirect("/");
  const packets = listFireflyReviewPackets().filter((packet) => !getFireflyReviewArchive(packet.packetId));
  const entries = await Promise.all(packets.map(async (packet) => ({ packet, decisions: await listFireflyReviewDecisions(packet.packetId) })));
  const query=await searchParams, all=await listPlanningCanaries(true);
  const archiveCount=listStoredFireflyReviewPackets().filter(p=>getFireflyReviewArchive(p.packetId)).length+all.filter(c=>c.lifecycle?.archived).length;
  const active=all.filter(c=>!c.lifecycle?.archived);
  const decisions=await listDecisionsForPackets(active.map(c=>c.id));
  const canaries=active.map(canary=>({canary,decisions:decisions.get(canary.id)||[]}));
  return <ReviewCollection canaries={canaries} user={user} entries={entries} mode="board" archiveCount={archiveCount} query={query}/>;
}
