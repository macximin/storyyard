import { createHash } from "node:crypto";
export const hashText = (value) => createHash("sha256").update(value,"utf8").digest("hex");
export function formatIssues(markdown) {
 const sections=[...markdown.matchAll(/^#{1,2}\s+(\d+)\.\s+(.+)$/gmu)];
 const issues=[];
 if(sections.length!==9 || sections.some((s,i)=>Number(s[1])!==i+1)) issues.push("합의한 1~9절 확인 필요");
 const two=sections.find(s=>s[1]==="2"),three=sections.find(s=>s[1]==="3");
 const body=two&&three?markdown.slice(two.index,three.index):"";
 for(const w of ["WHO","WHAT","HOW","WHERE","WHEN","WHY"]) if(!new RegExp(`\\b${w}\\b`).test(body)) issues.push(`${w} 확인 필요`);
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
