import archives from "@/data/firefly/planning-canaries/archive.json";
import index from "@/data/firefly/planning-canaries/index.json";
import {eq,desc,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {fireflyReviewSnapshots,fireflyCanaryArchives} from "@/db/schema";
import {validateCanary} from "./firefly-canary-contract.mjs";
export type PlanningCanary = {schemaVersion:string;id:string;batchId:string;title:string;generatedAt:string;state:"complete"|"incomplete"|"failed"|"running";markdown:string;inputSha256:string;outputSha256:string;author:{route:string;model:string;reasoning:string};issues:string[];reviewNotes?:string[];receipt:Record<string,unknown>;lifecycle?:{archived:boolean;reason?:string;replacementId?:string|null}};
export type CanarySummary=Pick<PlanningCanary,"id"|"title"|"batchId"|"generatedAt"|"state"|"author"|"lifecycle"|"inputSha256"|"outputSha256"> & {executionDate?:string};
export async function listPlanningCanaries(includeArchived=false):Promise<CanarySummary[]>{
 // Lightweight projection: full immutable bodies are loaded only on detail/ingest.
 const stored=await getDb().select({id:fireflyReviewSnapshots.packetId,title:fireflyReviewSnapshots.title,batchId:fireflyReviewSnapshots.bookId,generatedAt:fireflyReviewSnapshots.generatedAt,inputSha256:sql<string>`json_extract(${fireflyReviewSnapshots.payload}, '$.inputSha256')`,outputSha256:sql<string>`json_extract(${fireflyReviewSnapshots.payload}, '$.outputSha256')`,executionDate:sql<string>`json_extract(${fireflyReviewSnapshots.payload}, '$.receipt.input.date')`,state:sql<PlanningCanary["state"]>`json_extract(${fireflyReviewSnapshots.payload}, '$.state')`,author:sql<string>`json_extract(${fireflyReviewSnapshots.payload}, '$.author')`}).from(fireflyReviewSnapshots).where(eq(fireflyReviewSnapshots.schemaVersion,"firefly-planning-canary/v1")).orderBy(desc(fireflyReviewSnapshots.generatedAt));
 const overrides=await getDb().select().from(fireflyCanaryArchives);
 const visibility=new Map(overrides.map(x=>[x.canaryId,x]));
 const all=new Map<string,CanarySummary>();
 for(const c of index as PlanningCanary[])all.set(c.id,{id:c.id,inputSha256:c.inputSha256,outputSha256:c.outputSha256,title:c.title,batchId:c.batchId,generatedAt:c.generatedAt,state:c.state,author:c.author,executionDate:(c.receipt.input as {date?:string})?.date});
 for(const row of stored)if(!all.has(row.id))all.set(row.id,{...row,author:JSON.parse(row.author)});
 return [...all.values()].map(c=>({...c,lifecycle:visibility.get(c.id)??{archived:Boolean(getPlanningCanaryArchive(c.id)),...getPlanningCanaryArchive(c.id)}})).filter(c=>includeArchived || !c.lifecycle.archived).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt)||b.id.localeCompare(a.id));
}
export async function getCanaryLifecycle(id:string){
 const [row]=await getDb().select().from(fireflyCanaryArchives).where(eq(fireflyCanaryArchives.canaryId,id)).limit(1);
 return row??{archived:Boolean(getPlanningCanaryArchive(id)),...getPlanningCanaryArchive(id)};
}
export async function getPlanningCanary(id:string):Promise<PlanningCanary|undefined>{
 const fixed=(index as PlanningCanary[]).find(c=>c.id===id);if(fixed)return validateCanary(fixed);
 const [row]=await getDb().select().from(fireflyReviewSnapshots).where(eq(fireflyReviewSnapshots.packetId,id)).limit(1);
 return row?.schemaVersion==="firefly-planning-canary/v1"?validateCanary(JSON.parse(row.payload)):undefined;
}

export function getPlanningCanaryArchive(id:string){return (archives as Record<string,{reason:string;replacementId?:string}>)[id];}
