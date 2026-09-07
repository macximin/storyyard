import test from 'node:test';
import assert from 'node:assert/strict';
import {hashText,formatIssues,validateCanary,decisionIntent} from '../app/firefly-canary-contract.mjs';
const markdown=Array.from({length:9},(_,i)=>`## ${i+1}. 제목\n${i===1?'WHO WHAT HOW WHERE WHEN WHY':'본문'}`).join('\n');
const make=()=>({schemaVersion:'firefly-planning-canary/v1',id:'fcp-'+'1'.repeat(24),markdown,outputSha256:hashText(markdown),inputSha256:'2'.repeat(64),author:{route:'web',model:'observed'},batchId:'batch',state:'complete',generatedAt:new Date().toISOString(),receipt:{inputSha256:'2'.repeat(64),outputSha256:hashText(markdown)}});
test('complete plan includes all nine sections and six Ws',()=>{assert.deepEqual(formatIssues(markdown),[]);assert.equal(validateCanary(make()).state,'complete');});
test('tampered output or provenance rejected',()=>{assert.throws(()=>validateCanary({...make(),markdown:markdown+'tamper'}));const c=make();c.receipt.inputSha256='3'.repeat(64);assert.throws(()=>validateCanary(c));});
test('missing WHAT or final section cannot be complete',()=>{for(const m of [markdown.replace('WHAT',''),markdown.replace('## 9. 제목','제목')]){const c=make();c.markdown=m;c.outputSha256=hashText(m);c.receipt.outputSha256=c.outputSha256;assert.throws(()=>validateCanary(c));}});
test('human decision binds exact input and output, failed plan cannot be selected',()=>{const c=make();const i={inputSha256:c.inputSha256,outputSha256:c.outputSha256,decision:'select',comment:'검토'};assert.equal(decisionIntent(c,i).decision,'select');assert.equal(decisionIntent(c,{...i,outputSha256:'stale'}).status,409);assert.equal(decisionIntent(c,{...i,decision:'approve'}).status,400);c.state='failed';assert.equal(decisionIntent(c,i).status,409);assert.equal(decisionIntent(c,{...i,decision:'hold'}).decision,'hold');});

import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {hasDistinctBearerAuthority} from '../app/firefly-review-service-auth.ts';
import * as contract from '../app/firefly-canary-contract.mjs';
const require=createRequire(import.meta.url);
async function routeHarness(role='admin',archived=false){
 const c=make(),writes=[];let reads=0;
 const db={select:()=>({from:()=>({where:()=>({orderBy:()=>Object.assign([],{limit:async()=>{reads++;return [];}})})})}),insert:table=>({values:value=>{writes.push({table,value});return {onConflictDoNothing:async()=>{}};}})};
 const dependencies={'@/app/chatgpt-auth':{runtimeSecret:name=>name==='STORYYARD_REVIEW_SYNC_TOKEN'?'read-token':'apply-token',getChatGPTUser:async()=>role?{role,id:'test-user',email:'test@example.invalid'}:null},'@/app/firefly-review-service-auth':{hasDistinctBearerAuthority},'@/app/firefly-canaries':{getPlanningCanary:id=>id===c.id?c:undefined,getPlanningCanaryArchive:()=>archived?{reason:'archived'}:undefined},'@/app/firefly-canary-contract.mjs':contract,'@/db':{getDb:()=>db},'@/db/schema':{fireflyReviewDecisions:{},fireflyReviewSnapshots:{}},'drizzle-orm':{and:()=>null,desc:()=>null,eq:()=>null}};
 const source=await readFile(new URL('../app/api/firefly/canary-decisions/route.ts',import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new Function('require','module','exports',compiled)(name=>dependencies[name]??require(name),module,module.exports);
 const send=(input,origin='https://review.example')=>module.exports.POST(new Request('https://review.example/api/firefly/canary-decisions',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({id:c.id,inputSha256:c.inputSha256,outputSha256:c.outputSha256,decision:'select',comment:'실제 선택',...input})}));return {c,writes,send,read:token=>module.exports.GET(new Request(`https://review.example/api/firefly/canary-decisions?id=${c.id}`,{headers:token?{Authorization:`Bearer ${token}`}:{}})),reads:()=>reads};
}
test('canary endpoint denies anonymous, non-admin, foreign-origin and stale writes',async()=>{
 for(const role of [null,'user']){const h=await routeHarness(role);assert.equal((await h.send({})).status,403);assert.equal(h.reads(),0);assert.equal(h.writes.length,0);}
 const h=await routeHarness();assert.equal((await h.send({},'https://other.example')).status,403);assert.equal((await h.send({outputSha256:'stale'})).status,409);assert.equal((await h.send({id:'missing'})).status,404);assert.equal(h.writes.length,0);
});
test('canary decision stores the exact immutable packet and remains pending',async()=>{const h=await routeHarness();assert.equal((await h.send({})).status,201);assert.equal(h.writes.length,2);assert.equal(h.writes[0].value.payload,JSON.stringify(h.c));assert.equal(h.writes[0].value.packetSha256,hashText(JSON.stringify(h.c)));assert.equal(h.writes[1].value.candidateSha256,h.c.outputSha256);assert.equal(h.writes[1].value.status,'pending');assert.equal(h.writes[1].value.schemaVersion,'firefly-canary-decision/v1');});

test('canary readback accepts only admin or distinct review-sync token without mutations',async()=>{const h=await routeHarness(null);assert.equal((await h.read()).status,403);assert.equal((await h.read('apply-token')).status,403);const r=await h.read('read-token');assert.equal(r.status,200);assert.equal((await r.json()).canary.outputSha256,h.c.outputSha256);assert.equal(h.writes.length,0);});

test('published canaries preserve individual receipts and unique failed identities',async()=>{const rows=JSON.parse(await readFile(new URL('../data/firefly/planning-canaries/index.json',import.meta.url),'utf8'));assert.equal(rows.length,12);assert.equal(new Set(rows.map(c=>c.id)).size,12);assert.equal(new Set(rows.map(c=>c.inputSha256)).size,1);for(const c of rows){validateCanary(c);assert.equal(c.receipt.input.sources.length,3);assert.ok(c.receipt.attempts.length>=1);assert.equal(c.receipt.rawWriterOutputSha256,c.receipt.attempts.at(-1).outputSha256);assert.notEqual(hashText(JSON.stringify(c)),c.outputSha256);}});
test('running canaries cannot receive premature HIL decisions',()=>{const c=make();c.state='running';for(const decision of ['select','hold','reject'])assert.equal(decisionIntent(c,{inputSha256:c.inputSha256,outputSha256:c.outputSha256,decision,comment:''}).status,409);});

test('archived executions retain readback but reject new HIL writes',async()=>{const h=await routeHarness('admin',true);assert.equal((await h.send({})).status,409);assert.equal(h.writes.length,0);assert.equal((await h.read()).status,200);});
