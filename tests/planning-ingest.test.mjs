import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as contract from '../app/firefly-canary-contract.mjs';
import * as catalog from '../app/firefly-canary-catalog.mjs';
const require=createRequire(import.meta.url);
async function harness(){
 const stored=new Map();let writes=0;
 const source=await readFile(new URL('../app/api/firefly/planning-canaries/route.ts',import.meta.url),'utf8');
 const dependencies={'@/app/firefly-canary-catalog.mjs':catalog,'drizzle-orm':{eq:()=>null,desc:()=>null},'@/app/chatgpt-auth':{runtimeSecret:n=>({'STORYYARD_PLANNING_INGEST_TOKEN':'ingest','STORYYARD_APPLY_TOKEN':'apply','STORYYARD_REVIEW_SYNC_TOKEN':'sync'})[n]},'@/app/firefly-review-service-auth':{hasDistinctBearerAuthority:(r,t,f)=>t!==f&&r.headers.get('authorization')===`Bearer ${t}`},'@/app/firefly-canaries':{getPlanningCanary:async id=>stored.get(id)},'@/app/firefly-canary-contract.mjs':contract,'@/db/schema':{fireflyReviewSnapshots:{},fireflyReviewDecisions:{}},'@/db':{getDb:()=>({insert:()=>({values:v=>({onConflictDoNothing:async()=>{writes++;if(!stored.has(v.packetId))stored.set(v.packetId,JSON.parse(v.payload));}})})})}};
 const module={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>dependencies[n]??require(n),module,module.exports);
 const c=JSON.parse(await readFile(new URL('../data/firefly/planning-canaries/index.json',import.meta.url),'utf8'))[0];
 return {c,stored,writes:()=>writes,post:(body,token='ingest')=>module.exports.POST(new Request('https://example.invalid/api/firefly/planning-canaries',{method:'POST',headers:{authorization:`Bearer ${token}`},body:typeof body==='string'?body:JSON.stringify(body)}))};
}
test('ingest excludes anonymous, sync and apply authority',async()=>{const h=await harness();for(const token of ['','sync','apply'])assert.equal((await h.post(h.c,token)).status,403);assert.equal(h.writes(),0);});
test('ingest rejects tampered content and running results',async()=>{const h=await harness();assert.equal((await h.post({...h.c,markdown:'tampered'})).status,400);assert.equal((await h.post({...h.c,state:'running'})).status,400);assert.equal((await h.post('x'.repeat(1000001))).status,413);assert.equal(h.writes(),0);});
test('ingest is immutable and idempotent without HIL writes',async()=>{const h=await harness();assert.equal((await h.post(h.c)).status,201);assert.equal((await h.post(h.c)).status,200);assert.equal((await h.post({...h.c,title:'different'})).status,409);assert.equal(h.writes(),1);assert.deepEqual(h.stored.get(h.c.id),h.c);});
