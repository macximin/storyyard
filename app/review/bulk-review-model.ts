export type BulkItem = { id:string; title:string; inputSha256:string; outputSha256:string; running:boolean };
export type BulkAction = 'reject' | 'archive' | 'reject_archive' | 'restore';
export type BulkResult = {id:string; ok:boolean; rejected:boolean; error?:string};
type Post = (url:string,body:Record<string,unknown>)=>Promise<void>;
// Each item retains its own outcome. A retry of a partial rejection/archive only retries archive.
export async function applyBulkItem(item:BulkItem,action:BulkAction,reason:string,post:Post,alreadyRejected=false):Promise<BulkResult> {
 let rejected=alreadyRejected;
 try {
  if((action==='reject'||action==='reject_archive')&&!rejected){
   if(item.running)throw Error('작성 중인 기획서는 완료 후 반려할 수 있습니다.');
   await post('/api/firefly/canary-decisions',{id:item.id,inputSha256:item.inputSha256,outputSha256:item.outputSha256,decision:'reject',comment:reason});
   rejected=true;
  }
  if(action!=='reject')await post('/api/firefly/canary-archive',{id:item.id,outputSha256:item.outputSha256,expectedArchived:action==='restore',archived:action!=='restore',reason});
  return {id:item.id,ok:true,rejected};
 }catch(error){return {id:item.id,ok:false,rejected,error:error instanceof Error?error.message:'처리 결과를 확인하지 못했습니다.'};}
}
