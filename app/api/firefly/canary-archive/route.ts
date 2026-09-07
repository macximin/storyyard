import {getChatGPTUser} from "@/app/chatgpt-auth";
import {getPlanningCanary,getCanaryLifecycle} from "@/app/firefly-canaries";
import {archiveIntent} from "@/app/firefly-canary-catalog.mjs";
import {getDb} from "@/db";
import {fireflyCanaryArchives} from "@/db/schema";
export async function POST(request:Request){
 const user=await getChatGPTUser();if(user?.role!=='admin')return Response.json({error:'관리자만 보관 상태를 바꿀 수 있습니다.'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'요청 출처를 확인해 주세요.'},{status:403});
 const raw=await request.text();if(raw.length>5000)return Response.json({error:'메모가 너무 깁니다.'},{status:413});
 let input;try{input=JSON.parse(raw);}catch{return Response.json({error:'잘못된 요청입니다.'},{status:400});}
 const c=typeof input?.id==='string'?await getPlanningCanary(input.id):null;if(!c)return Response.json({error:'기획서를 찾을 수 없습니다.'},{status:404});
 const current=await getCanaryLifecycle(c.id),intent=archiveIntent(c,current,input);if(intent.error)return Response.json({error:intent.error},{status:intent.status});
 const value={canaryId:c.id,archived:intent.archived,reason:intent.reason,replacementId:current.replacementId??null,actorUserId:user.id,updatedAt:new Date().toISOString()};
 await getDb().insert(fireflyCanaryArchives).values(value).onConflictDoUpdate({target:fireflyCanaryArchives.canaryId,set:value});
 const checked=await getCanaryLifecycle(c.id);if(checked.archived!==value.archived)return Response.json({error:'변경 상태를 다시 확인해 주세요.'},{status:409});
 return Response.json({lifecycle:checked},{headers:{'Cache-Control':'private, no-store'}});
}
