import assert from 'node:assert/strict';
import test from 'node:test';
import {collectionRows,collectionPage,collectionHref} from '../app/review/collection-model.ts';
const canaries = Array.from({length:121},(_,i)=>({canary:{id:`test-${String(i).padStart(3,'0')}`,title:`작품 ${i}`,state:'complete',generatedAt:'2026-09-13T00:00:00Z',author:{route:i%2?'chatgpt-web':'grok-web'}},decisions:[]}));
test('search and status filtering include entries beyond the first page',()=>{
 const rows=collectionRows([],canaries,'board');
 assert.equal(collectionPage(rows,{q:'작품 120'}).items[0].id,'canary-test-120');
 const pages=[1,2,3].flatMap(page=>collectionPage(rows,{page:String(page)}).items.map(r=>r.id));
 assert.equal(pages.length,121); assert.equal(new Set(pages).size,121);
 assert.equal(collectionPage(rows,{page:'999'}).page,3);
 assert.equal(collectionPage(rows,{page:'-1'}).page,1);
 assert.equal(collectionPage(rows,{route:'chatgpt-web'}).filteredTotal,60);
});
test('latest decision determines visible opinion without turning it into processing confirmation',()=>{
 const entry=structuredClone(canaries[0]);
 entry.decisions=[{decision:'reject',status:'pending',createdAt:'2026-09-12T10:00:00Z'},{decision:'hold',status:'pending',createdAt:'2026-09-13T10:00:00Z'}];
 const rows=collectionRows([],[entry],'board');
 assert.equal(rows[0].status,'hold'); assert.equal(rows[0].stage,'recorded');
 assert.equal(collectionPage(rows,{status:'hold'}).filteredTotal,1);
 assert.equal(collectionPage(rows,{status:'confirmed'}).filteredTotal,0);
 assert.equal(entry.decisions[0].decision,'reject');
 entry.canary.lifecycle={archived:true};
 assert.equal(collectionRows([],[entry],'board').length,0);
 assert.equal(collectionRows([],[entry],'archive').length,1);
});
test('view and page links preserve Korean search terms and filters',()=>{
 const href=collectionHref('/review/board',{q:'회장 & 재벌',status:'hold',sort:'recent',view:'list'},{page:'2'});
 const url=new URL(href,'https://example.invalid');
 assert.equal(url.searchParams.get('q'),'회장 & 재벌'); assert.equal(url.searchParams.get('status'),'hold');
 assert.equal(url.searchParams.get('page'),'2'); assert.equal(url.searchParams.has('view'),false);
});
