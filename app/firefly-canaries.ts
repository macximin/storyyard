import index from "@/data/firefly/planning-canaries/index.json";
import { validateCanary } from "./firefly-canary-contract.mjs";
export type PlanningCanary = {schemaVersion:string;id:string;batchId:string;title:string;generatedAt:string;state:"complete"|"incomplete"|"failed"|"running";markdown:string;inputSha256:string;outputSha256:string;author:{route:string;model:string;reasoning:string};issues:string[];reviewNotes?:string[];receipt:Record<string,unknown>};
export function listPlanningCanaries():PlanningCanary[]{return (index as PlanningCanary[]).map(c=>validateCanary(c));}
export function getPlanningCanary(id:string){return listPlanningCanaries().find(c=>c.id===id);}
