import type {PlanningCanary} from "../firefly-canaries";
import {receiptView} from "../firefly-canary-catalog.mjs";
function show(value:unknown){return value===null||value===undefined?"미확인":String(value);}
export function CanaryReceipt({canary:c}:{canary:PlanningCanary}){
 const view=receiptView(c),r=c.receipt;
 return <details id="receipt" className="commercial-promise-card"><summary>실행 영수증 · 입력 및 결과 증빙</summary>
 <p>실행 완료와 사람의 채택은 별도로 기록합니다.</p><dl>
 <dt>작성 경로</dt><dd>{c.author.route} · {c.author.model} · {c.author.reasoning}</dd>
 <dt>공통 입력</dt><dd>{view.sources.length?<ul>{view.sources.map((s:{id?:string;title:string;excerptCharacters?:number;scope?:string},i:number)=><li key={s.id||i}>{s.title}{s.excerptCharacters!==undefined&&` · 원문 발췌 ${s.excerptCharacters.toLocaleString()}자`}{s.scope&&` · ${s.scope}`}</li>)}</ul>:"이전 영수증에 구조화된 출처가 없습니다. 아래 원본 기록을 확인하세요."}</dd>
 <dt>선택된 시도</dt><dd>{show(view.selectedAttempt)} / {view.attempts.length}</dd>
 <dt>입력 해시</dt><dd style={{overflowWrap:"anywhere"}}>{c.inputSha256}</dd><dt>표시 본문 해시</dt><dd style={{overflowWrap:"anywhere"}}>{c.outputSha256}</dd></dl>
 {view.originalId&&<p>표시 형식을 복구한 기획서입니다. <a href={`/review/canary/${view.originalId}`}>이전 원문·HIL 보기</a> · 이전 판정은 이 버전의 채택으로 승계되지 않습니다.</p>}
 {view.attempts.map((a:Record<string,unknown>,i:number)=><section key={i}><h3>시도 {i+1}</h3><p>{show(a.status)} · {show(a.elapsedSeconds)}초</p>{typeof a.error==="string"&&<p>{a.error}</p>}{typeof a.conversationUrl==="string"&&/^https:\/\/(?:chatgpt\.com|grok\.com|gemini\.google\.com)\//.test(a.conversationUrl)&&<a href={a.conversationUrl} target="_blank" rel="noreferrer">작성 서비스에서 원응답 열기</a>}</section>)}
 <p>웹 작성 모델의 토큰·비용은 미확인입니다. 브라우저 관제 사용량과 작성자 사용량은 별도로 기록합니다.</p><details><summary>해시·사용량·서비스 기록 전체</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(r,null,2)}</pre></details></details>;
}
