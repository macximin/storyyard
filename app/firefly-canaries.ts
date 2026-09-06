import index from "@/data/firefly/planning-canaries/index.json";
import {eq,desc} from "drizzle-orm";
import {getDb} from "@/db";
import {fireflyReviewSnapshots} from "@/db/schema";
import {validateCanary} from "./firefly-canary-contract.mjs";
export type PlanningCanary = {schemaVersion:string;id:string;batchId:string;title:string;generatedAt:string;state:"complete"|"incomplete"|"failed"|"running";markdown:string;inputSha256:string;outputSha256:string;author:{route:string;model:string;reasoning:string};issues:string[];reviewNotes?:string[];receipt:Record<string,unknown>};
export async function listPlanningCanaries():Promise<PlanningCanary[]>{
 const stored=await getDb().select().from(fireflyReviewSnapshots).where(eq(fireflyReviewSnapshots.schemaVersion,"firefly-planning-canary/v1")).orderBy(desc(fireflyReviewSnapshots.generatedAt)).limit(120);
 const all=new Map<string,PlanningCanary>();
 for(const c of index as PlanningCanary[])all.set(c.id,validateCanary(c));
 for(const row of stored){const c=validateCanary(JSON.parse(row.payload));if(!all.has(c.id))all.set(c.id,c);}
 return [...all.values()].sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt));
}
export async function getPlanningCanary(id:string):Promise<PlanningCanary|undefined>{
 const fixed=(index as PlanningCanary[]).find(c=>c.id===id);if(fixed)return validateCanary(fixed);
 const [row]=await getDb().select().from(fireflyReviewSnapshots).where(eq(fireflyReviewSnapshots.packetId,id)).limit(1);
 return row?.schemaVersion==="firefly-planning-canary/v1"?validateCanary(JSON.parse(row.payload)):undefined;
}
