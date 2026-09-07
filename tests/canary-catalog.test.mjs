import test from 'node:test';
import assert from 'node:assert/strict';
import {pageCanaries,receiptView,archiveIntent} from '../app/firefly-canary-catalog.mjs';
test('KST execution dates and mixed timestamp formats keep every card reachable',()=>{
 const cards=['2026-09-07T17:00:00Z','2026-09-07T17:00:00+00:00','2026-09-07T17:00:00.000Z','2026-09-07T17:00:00.000001+00:00'].map((generatedAt,i)=>({id:String(i),generatedAt,author:{route:'astra'}}));
 let cursor='',seen=[];do{const page=pageCanaries(cards,{cursor,limit:1,date:'2026-09-08'});seen.push(...page.items.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(new Set(seen).size,4);assert.equal(pageCanaries(cards,{date:'2026-09-07'}).total,0);
 const recovered={...cards[0],batchId:'sentinel-canary-20260907',generatedAt:'2026-09-08T00:00:00Z'};assert.equal(pageCanaries([recovered],{date:'2026-09-07'}).total,1);
});
test('all 165 cards remain reachable with tied timestamps and filters',()=>{
 const cards=Array.from({length:165},(_,i)=>({id:String(i).padStart(4,'0'),generatedAt:'2026-09-08T00:00:00Z',author:{route:i%2?'astra':'grok-web'}}));
 let cursor='',seen=[];do{const page=pageCanaries(cards,{cursor,limit:30});seen.push(...page.items.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(seen.length,165);assert.equal(new Set(seen).size,165);
 assert.equal(pageCanaries(cards,{route:'astra'}).total,82);assert.equal(pageCanaries(cards,{date:'2026-09-07'}).total,0);
 const recovered={...cards[0],batchId:'sentinel-canary-20260907',generatedAt:'2026-09-08T00:00:00Z'};assert.equal(pageCanaries([recovered],{date:'2026-09-07'}).total,1);assert.throws(()=>pageCanaries(cards,{cursor:'bad'}));
});
test('receipt shows actual rotated sources and process attempts',()=>{
 const c={receipt:{input:{sources:[{title:'실제 참고작'}]},process:{status:'process_completed'},web:{conversationUrl:'https://grok.com/c/test'},previousAttempts:[{status:'failed'}],presentationRecovery:{originalId:'old'}}};
 const view=receiptView(c);assert.equal(view.sources[0].title,'실제 참고작');assert.equal(view.attempts.length,2);assert.equal(view.selectedAttempt,2);assert.equal(view.originalId,'old');
 assert.equal(receiptView({receipt:{attempts:[{}],selectedAttempt:0}}).selectedAttempt,0);
});
test('archive state cannot be changed from stale body or stale visibility',()=>{
 const c={outputSha256:'exact'},state={archived:false};
 assert.equal(archiveIntent(c,state,{archived:true,expectedArchived:false,outputSha256:'exact',reason:''}).archived,true);
 assert.equal(archiveIntent(c,state,{archived:true,expectedArchived:true,outputSha256:'exact',reason:''}).status,409);
 assert.equal(archiveIntent(c,state,{archived:true,expectedArchived:false,outputSha256:'stale',reason:''}).status,409);
 assert.equal(archiveIntent(c,state,{archived:'true',reason:''}).status,400);
});

import {contentIssues} from '../app/firefly-canary-contract.mjs';
test('new complete submissions require answers beyond table headings and labels',()=>{
 const words=['WHO','WHAT','HOW','WHERE','WHEN','WHY'];
 const empty=Array.from({length:9},(_,i)=>`## ${i+1}. 제목\n${i===1?words.map(w=>`| ${w} | 구체화할 질문 | |`).join('\n'):'| 항목 | 기입 |\n| --- | --- |'}`).join('\n');
 const issues=contentIssues(empty);for(const w of words)assert.ok(issues.includes(`${w} 답변 확인 필요`));assert.ok(issues.includes('1절 본문 확인 필요'));
});
test('filled six-W brackets are content while template placeholders stay incomplete',()=>{
 const words=['WHO','WHAT','HOW','WHERE','WHEN','WHY'];
 const document=answers=>Array.from({length:9},(_,i)=>`## ${i+1}. 제목\n${i===1?words.map((w,n)=>`| **${w} — 질문** | 구체화할 질문 | ${answers[n]} |`).join('\n'):'주인공의 선택과 실제 결과가 이어진다.'}`).join('\n');
 const filled=['[투자 경험을 가진 주인공이 친척들과 후계 경쟁을 한다.]','[남에게 빼앗기지 않는 자기 자본을 구축한다.]','[회귀로 얻은 미래 정보로 위기 자산을 선점하고 수익을 얻는다.]','[서울 금융가와 기업 인수 현장에서 움직인다.]','[경제 위기가 시작되기 직전에 첫 투자를 준비한다.]','[다시는 자신의 성과를 빼앗기고 싶지 않기 때문이다.]'];
 assert.deepEqual(contentIssues(document(filled)),[]);
 for(const label of ['','[]','[기입]','[내용]','미정','**[기입]**']){
  const issues=contentIssues(document(words.map(()=>label)));
  for(const word of words)assert.ok(issues.includes(`${word} 답변 확인 필요`),label);
 }
 const placeholders=['[구체적인 인물과 관계]','[작품 전체의 이야기와 장기 목적]','[우위의 원리 → 선택 → 실행 → 결과]','[구체적인 무대와 작동 조건]','[시대·시작 시점·행동의 계기]','[개인적인 욕망과 동기]'];
 for(const word of words)assert.ok(contentIssues(document(placeholders)).includes(`${word} 답변 확인 필요`));
});
