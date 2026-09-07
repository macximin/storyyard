export function executionDate(c){
 if(c.executionDate)return c.executionDate;
 const date=c.receipt?.input?.date;if(/^\d{4}-\d{2}-\d{2}$/.test(date||''))return date;
 const match=/^daily-planning-(\d{4})(\d{2})(\d{2})$/.exec(c.batchId||'');if(match)return `${match[1]}-${match[2]}-${match[3]}`;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c.generatedAt));
}
export function pageCanaries(items,{cursor='',date='',route='',limit=30}={}) {
 const size=Math.max(1,Math.min(100,Number(limit)||30));
 const key=c=>new Date(c.generatedAt).toISOString();
 const cmp=(a,b)=>a<b?-1:a>b?1:0;
 const sorted=items.filter(c=>(!date||executionDate(c)===date)&&(!route||c.author.route===route)).sort((a,b)=>cmp(key(b),key(a))||cmp(b.id,a.id));
 let boundary=null;try{boundary=cursor?JSON.parse(cursor):null;}catch{throw new Error('Invalid cursor');}
 if(boundary&&(!Array.isArray(boundary)||boundary.length!==2||boundary.some(x=>typeof x!=='string')))throw new Error('Invalid cursor');
 const remaining=boundary?sorted.filter(c=>key(c)<boundary[0]||(key(c)===boundary[0]&&c.id<boundary[1])):sorted;
 const page=remaining.slice(0,size),last=page.at(-1);
 return {items:page,total:sorted.length,nextCursor:remaining.length>size&&last?JSON.stringify([key(last),last.id]):null};
}
export function receiptView(c){
 const r=c.receipt||{},input=r.input||{};
 const sources=Array.isArray(input.sources)?input.sources:[];
 const old=Array.isArray(r.attempts)?r.attempts:[];
 const attempts=old.length?old:[...(Array.isArray(r.previousAttempts)?r.previousAttempts:[]),...(r.process?[{...r.process,...r.web}]:[])];
 return {sources,attempts,selectedAttempt:r.selectedAttempt??(r.process?attempts.length:null),originalId:r.presentationRecovery?.originalId??null};
}
export function archiveIntent(c,lifecycle,input){
 if(!input||typeof input.archived!=='boolean'||typeof input.reason!=='string'||input.reason.length>1000)return {error:'보관 설정을 확인해 주세요.',status:400};
 if(input.outputSha256!==c.outputSha256||input.expectedArchived!==lifecycle.archived)return {error:'화면의 상태가 바뀌었습니다. 새로고침해 주세요.',status:409};
 return {archived:input.archived,reason:input.reason.trim()||(input.archived?'검토 목록에서 보관':'검토 목록으로 복원')};
}
