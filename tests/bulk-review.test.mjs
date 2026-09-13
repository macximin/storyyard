import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBulkItem} from '../app/review/bulk-review-model.ts';
const item={id:'test',title:'합성 기획서',inputSha256:'input-hash',outputSha256:'output-hash',running:false};
test('reject and archive uses exact selected identity and version in sequence',async()=>{
 const calls=[];
 const result=await applyBulkItem(item,'reject_archive','검토 메모',async(url,body)=>calls.push({url,body}));
 assert.equal(result.ok,true);
 assert.deepEqual(calls,[{url:'/api/firefly/canary-decisions',body:{id:'test',inputSha256:'input-hash',outputSha256:'output-hash',decision:'reject',comment:'검토 메모'}},{url:'/api/firefly/canary-archive',body:{id:'test',outputSha256:'output-hash',expectedArchived:false,archived:true,reason:'검토 메모'}}]);
});
test('rejection failure never archives the item and does not stop other selected items',async()=>{
 const calls=[];
 const post=async(url,body)=>{calls.push({url,body});if(body.id==='test')throw Error('버전 충돌');};
 const results=await Promise.all([applyBulkItem(item,'reject_archive','',post),applyBulkItem({...item,id:'next'},'reject_archive','',post)]);
 assert.equal(results[0].ok,false);assert.equal(results[1].ok,true);
 assert.equal(calls.filter(c=>c.body.id==='test').length,1);
});
test('partial success can retry archive without duplicating the rejection record',async()=>{
 const first=await applyBulkItem(item,'reject_archive','',async url=>{if(url.endsWith('archive'))throw Error('연결 실패');});
 assert.equal(first.ok,false);assert.equal(first.rejected,true);
 const calls=[];
 const retry=await applyBulkItem(item,'reject_archive','',async url=>calls.push(url),first.rejected);
 assert.equal(retry.ok,true);assert.deepEqual(calls,['/api/firefly/canary-archive']);
});
test('restore requires archived version; archive does not manufacture a decision',async()=>{
 for(const action of ['archive','restore']){
  const calls=[];await applyBulkItem(item,action,'',async(url,body)=>calls.push({url,body}));
  assert.equal(calls.length,1);assert.equal(calls[0].body.expectedArchived,action==='restore');assert.equal(calls[0].body.archived,action==='archive');
 }
});
test('running items cannot be rejected but remain archivable',async()=>{
 let writes=0;const running={...item,running:true};
 assert.equal((await applyBulkItem(running,'reject_archive','',async()=>{writes++;})).ok,false);
 assert.equal(writes,0);assert.equal((await applyBulkItem(running,'archive','',async()=>{writes++;})).ok,true);assert.equal(writes,1);
});
