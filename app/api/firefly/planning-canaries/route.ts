import {pageCanaries} from "@/app/firefly-canary-catalog.mjs";
import {eq,desc} from "drizzle-orm";
import {runtimeSecret} from "@/app/chatgpt-auth";
import {hasDistinctBearerAuthority} from "@/app/firefly-review-service-auth";
import {listPlanningCanaries,getPlanningCanary,getCanaryLifecycle} from "@/app/firefly-canaries";
import {hashText,validateCanary,contentIssues} from "@/app/firefly-canary-contract.mjs";
import {getDb} from "@/db";
import {fireflyReviewSnapshots,fireflyReviewDecisions} from "@/db/schema";

function authorized(request:Request){
 const token=runtimeSecret("STORYYARD_PLANNING_INGEST_TOKEN");
 return hasDistinctBearerAuthority(request,token,runtimeSecret("STORYYARD_APPLY_TOKEN")) && token!==runtimeSecret("STORYYARD_REVIEW_SYNC_TOKEN");
}
const headers={"Cache-Control":"private, no-store"};
export async function POST(request:Request){
 if(!authorized(request))return Response.json({error:"Forbidden"},{status:403,headers});
 if(Number(request.headers.get("content-length")??0)>1000000)return Response.json({error:"Too large"},{status:413,headers});
 const raw=await request.text();if(raw.length>1000000)return Response.json({error:"Too large"},{status:413,headers});
 let c;try{c=validateCanary(JSON.parse(raw));
  if(typeof c.title!=="string"||!c.title.trim()||c.title.length>300||!Array.isArray(c.issues)||c.issues.some((s:unknown)=>typeof s!=="string")||c.state==="running")throw Error("Invalid terminal review record");
  if(typeof c.author.route!=="string"||typeof c.author.model!=="string"||typeof c.author.reasoning!=="string"||typeof c.batchId!=="string")throw Error("Invalid author");
  if(c.reviewNotes!==undefined&&(!Array.isArray(c.reviewNotes)||c.reviewNotes.some((s:unknown)=>typeof s!=="string")))throw Error("Invalid review notes");
 }catch{return Response.json({error:"Invalid canary"},{status:400,headers});}
 const digest=hashText(JSON.stringify(c));
 const previous=await getPlanningCanary(c.id);
 if(previous){const same=hashText(JSON.stringify(previous))===digest;return Response.json({id:c.id,duplicate:same,error:same?undefined:"Immutable ID conflict"},{status:same?200:409,headers});}
 if(c.state==='complete'&&contentIssues(c.markdown).length)return Response.json({error:'Complete plan has empty required content',issues:contentIssues(c.markdown)},{status:400,headers});
 await getDb().insert(fireflyReviewSnapshots).values({packetId:c.id,packetSha256:digest,schemaVersion:c.schemaVersion,bookId:c.batchId,artifactId:c.id,title:c.title,payload:JSON.stringify(c),sourceRevision:c.inputSha256,generatedAt:c.generatedAt,importedAt:new Date().toISOString()}).onConflictDoNothing();
 const saved=await getPlanningCanary(c.id);if(!saved||hashText(JSON.stringify(saved))!==digest)return Response.json({error:"Concurrent conflict"},{status:409,headers});
 return Response.json({id:c.id,outputSha256:c.outputSha256,reviewUrl:`/review/canary/${c.id}`},{status:201,headers});
}
export async function GET(request:Request){
 if(!authorized(request))return Response.json({error:"Forbidden"},{status:403,headers});
 const params=new URL(request.url).searchParams;
 if(params.get("view")==="hil"){
  const decisions=await getDb().select().from(fireflyReviewDecisions).orderBy(desc(fireflyReviewDecisions.createdAt)).limit(1000);
  return Response.json({decisions,coverage:"review-and-canary",truncated:decisions.length===1000},{headers});
 }
 if(params.get("view")==="inventory"){
  let page;try{page=pageCanaries(await listPlanningCanaries(true),{cursor:params.get('cursor')||'',date:params.get('date')||'',route:params.get('route')||'',limit:Number(params.get('limit')||100)});}catch{return Response.json({error:'Invalid cursor'},{status:400,headers});}
  const canaries=await Promise.all(page.items.map(async (c:{id:string;lifecycle:unknown})=>({...await getPlanningCanary(c.id),lifecycle:c.lifecycle})));
  return Response.json({canaries,nextCursor:page.nextCursor,total:page.total},{headers});
 }
 const id=params.get("id");
 if(id){const c=await getPlanningCanary(id);if(!c)return Response.json({error:"Not found"},{status:404,headers});
  const decisions=await getDb().select().from(fireflyReviewDecisions).where(eq(fireflyReviewDecisions.packetId,id)).orderBy(desc(fireflyReviewDecisions.createdAt));
  return Response.json({canary:c,decisions,lifecycle:await getCanaryLifecycle(id)},{headers});}
 const rows=await getDb().select().from(fireflyReviewDecisions).where(eq(fireflyReviewDecisions.schemaVersion,"firefly-canary-decision/v1")).orderBy(desc(fireflyReviewDecisions.createdAt)).limit(100);
 return Response.json({decisions:rows},{headers});
}
