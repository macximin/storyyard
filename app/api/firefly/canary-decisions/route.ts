import {and,desc,eq} from "drizzle-orm";
import {getChatGPTUser,runtimeSecret} from "@/app/chatgpt-auth";
import {getPlanningCanary} from "@/app/firefly-canaries";
import {decisionIntent,hashText} from "@/app/firefly-canary-contract.mjs";
import {hasDistinctBearerAuthority} from "@/app/firefly-review-service-auth";
import {getDb} from "@/db";
import {fireflyReviewDecisions,fireflyReviewSnapshots} from "@/db/schema";
export async function POST(request:Request){
 const user=await getChatGPTUser();if(user?.role!=="admin")return Response.json({error:"관리자만 판정을 기록할 수 있습니다."},{status:403});
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"요청 출처를 확인해 주세요."},{status:403});
 const input=await request.json().catch(()=>null);const c=typeof input?.id==="string"?getPlanningCanary(input.id):undefined;if(!c)return Response.json({error:"등록된 기획서가 아닙니다."},{status:404});const intent=decisionIntent(c,input);if(intent.error)return Response.json({error:intent.error},{status:intent.status});
 const packetSha256=hashText(JSON.stringify(c));const db=getDb();const createdAt=new Date().toISOString();
 const [duplicate]=await db.select().from(fireflyReviewDecisions).where(and(eq(fireflyReviewDecisions.packetId,c.id),eq(fireflyReviewDecisions.actorUserId,user.id),eq(fireflyReviewDecisions.decision,intent.decision),eq(fireflyReviewDecisions.comment,intent.comment))).orderBy(desc(fireflyReviewDecisions.createdAt)).limit(1);
 if(duplicate&&duplicate.createdAt>=new Date(Date.now()-10000).toISOString())return Response.json({decision:{id:duplicate.id,decision:duplicate.decision,createdAt:duplicate.createdAt}});
 await db.insert(fireflyReviewSnapshots).values({packetId:c.id,packetSha256,schemaVersion:c.schemaVersion,bookId:c.batchId,artifactId:c.id,title:c.title,payload:JSON.stringify(c),sourceRevision:c.inputSha256,generatedAt:c.generatedAt,importedAt:createdAt}).onConflictDoNothing();
 const id=crypto.randomUUID();await db.insert(fireflyReviewDecisions).values({id,schemaVersion:"firefly-canary-decision/v1",packetId:c.id,packetSha256,bookId:c.batchId,artifactId:c.id,candidateId:c.id,candidateSha256:c.outputSha256,decision:intent.decision,comment:intent.comment,actorUserId:user.id,actorEmail:user.email,status:"pending",createdAt});
 return Response.json({decision:{id,decision:intent.decision,createdAt}},{status:201});
}

export async function GET(request:Request){
 const sync=hasDistinctBearerAuthority(request,runtimeSecret("STORYYARD_REVIEW_SYNC_TOKEN"),runtimeSecret("STORYYARD_APPLY_TOKEN"));
 if(!sync&&(await getChatGPTUser())?.role!=="admin")return Response.json({error:"관리자 또는 검토 동기화 읽기 권한이 필요합니다."},{status:403});
 const c=getPlanningCanary(new URL(request.url).searchParams.get("id")??"");if(!c)return Response.json({error:"등록된 기획서가 아닙니다."},{status:404});
 const decisions=await getDb().select().from(fireflyReviewDecisions).where(eq(fireflyReviewDecisions.packetId,c.id)).orderBy(desc(fireflyReviewDecisions.createdAt));
 return Response.json({canary:{id:c.id,title:c.title,inputSha256:c.inputSha256,outputSha256:c.outputSha256,state:c.state,author:c.author},decisions},{headers:{"Cache-Control":"private, no-store"}});
}
