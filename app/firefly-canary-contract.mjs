import { createHash } from "node:crypto";
export const hashText = (value) => createHash("sha256").update(value,"utf8").digest("hex");
const emptyAnswerLabels = new Set([
 "제목","작품명","가제","로그라인","주인공","내용","작성","기입",
 "미정","없음","해당 없음","n/a","tbd","body",
 "구체적인 인물과 관계","작품 전체의 이야기와 장기 목적",
 "우위의 원리 → 선택 → 실행 → 결과","구체적인 무대와 작동 조건",
 "시대·시작 시점·행동의 계기","개인적인 욕망과 동기",
]);
function hasAnswer(value){
 let text=value.replace(/[`*_]/g,'').trim();
 if(text.startsWith('[')&&text.endsWith(']'))text=text.slice(1,-1).trim();
 return /[가-힣A-Za-z0-9]/.test(text)&&!emptyAnswerLabels.has(text.toLowerCase());
}
export function formatIssues(markdown) {
 const sections=[...markdown.matchAll(/^#{1,2}\s+(\d+)\.\s+(.+)$/gmu)];
 const issues=[];
 if(sections.length!==9 || sections.some((s,i)=>Number(s[1])!==i+1)) issues.push("합의한 1~9절 확인 필요");
 const two=sections.find(s=>s[1]==="2"),three=sections.find(s=>s[1]==="3");
 const body=two&&three?markdown.slice(two.index,three.index):"";
 for(const w of ["WHO","WHAT","HOW","WHERE","WHEN","WHY"]) if(!new RegExp(`\\b${w}\\b`).test(body)) issues.push(`${w} 확인 필요`);
 return issues;
}
// New submissions must contain answers; legacy immutable snapshots retain their validation.
export function contentIssues(markdown){
 const text=markdown.replace(/<!--[\s\S]*?-->/g,''),issues=formatIssues(text);
 const sections=[...text.matchAll(/^#{1,2}\s+(\d+)\.\s+(.+)$/gmu)];
 const plain=s=>s.replace(/[`*_#|>~:\-\s]/g,'');
 for(let i=0;i<sections.length;i++){
  const s=sections[i],body=text.slice(s.index+s[0].length,sections[i+1]?.index??text.length);
  const bodyLines=body.split('\n');
  const hasContent=bodyLines.some((line,n)=>{
   if(!plain(line)||line.trim().startsWith('#')||/^\s*\*\*[^*]+\*\*\s*[:：]?\s*$/.test(line))return false;
   if(line.includes('|')&&/^[\s|:\-]+$/.test(bodyLines[n+1]||''))return false;
   return true;
  });
  if(!hasContent)issues.push(`${s[1]}절 본문 확인 필요`);
  if(s[1]==='2')for(const word of ['WHO','WHAT','HOW','WHERE','WHEN','WHY']){
   const lines=body.split('\n');let answered=false;
   for(let n=0;n<lines.length;n++){
    const line=lines[n];if(!new RegExp(`\\b${word}\\b`).test(line))continue;
    if((line.match(/\b(?:WHO|WHAT|HOW|WHERE|WHEN|WHY)\b/g)||[]).length!==1)continue;
    const tail=line.split(word)[1];let table=line.trim();if(table.startsWith('|'))table=table.slice(1);if(table.endsWith('|'))table=table.slice(0,-1);const cells=table.split('|');
    const value=line.includes('|')?cells.at(-1):tail.includes(':')?tail.slice(tail.indexOf(':')+1):tail.includes('：')?tail.slice(tail.indexOf('：')+1):lines.slice(n+1).join('\n').split(/\b(?:WHO|WHAT|HOW|WHERE|WHEN|WHY)\b|^#/m)[0];
    if(hasAnswer(value))answered=true;
   }
   if(!answered)issues.push(`${word} 답변 확인 필요`);
  }
 }
 if(/\[(?:제목|작품명|가제|로그라인|주인공|내용|작성|기입)\]/.test(text))issues.push('양식 자리표시자 확인 필요');
 return issues;
}
export function validateCanary(c) {
 if(!c || c.schemaVersion!=="firefly-planning-canary/v1" || !/^fcp-[a-f0-9]{24}$/.test(c.id)) throw new Error("Invalid canary identity");
 if(typeof c.markdown!=="string" || c.markdown.length>100000 || hashText(c.markdown)!==c.outputSha256) throw new Error("Canary content hash mismatch");
 if(!/^[a-f0-9]{64}$/.test(c.inputSha256)||!c.author?.route||!c.author?.model||!c.batchId||!c.receipt||c.receipt.inputSha256!==c.inputSha256||c.receipt.outputSha256!==c.outputSha256) throw new Error("Canary provenance missing or mismatched");
 if(!["complete","incomplete","failed","running"].includes(c.state)||!Number.isFinite(Date.parse(c.generatedAt))) throw new Error("Invalid canary state");
 if(c.state==="complete"&&formatIssues(c.markdown).length) throw new Error("Complete canary has missing sections");
 return c;
}
export function decisionIntent(c,input) {
 if(c.state==="running") return {error:"작성 중입니다. 완료된 본문에서 판정해 주세요.",status:409};
 if(!input||input.outputSha256!==c.outputSha256||input.inputSha256!==c.inputSha256) return {error:"기획서 버전이 달라졌습니다. 다시 열어 주세요.",status:409};
 if(!["select","hold","reject"].includes(input.decision)||typeof input.comment!=="string"||input.comment.length>12000) return {error:"판정과 코멘트를 확인해 주세요.",status:400};
 if(input.decision==="select"&&c.state!=="complete") return {error:"미완성 기획서는 보류·반려로 기록해 주세요.",status:409};
 return {decision:input.decision,comment:input.comment.trim()};
}
