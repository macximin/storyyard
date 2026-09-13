"use client";
import {createContext,useContext,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {applyBulkItem,type BulkItem,type BulkAction,type BulkResult} from './bulk-review-model.ts';
const Selection=createContext<{selected:Set<string>;toggle:(id:string)=>void;busy:boolean}>({selected:new Set(),toggle:()=>{},busy:false});
const labels:Record<BulkAction,string>={reject:'반려',archive:'보관',reject_archive:'반려 후 보관',restore:'복원'};
export function BulkReviewCheckbox({id,title}:{id:string;title:string}){
 const state=useContext(Selection);
 return <input className="ff-bulk-checkbox" type="checkbox" aria-label={`${title} 선택`} checked={state.selected.has(id)} disabled={state.busy} onChange={()=>state.toggle(id)}/>;
}
export function BulkReviewActions({items,archived,children}:{items:BulkItem[];archived:boolean;children:ReactNode}){
 const [selected,setSelected]=useState(new Set<string>()),[action,setAction]=useState<BulkAction|null>(null),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[results,setResults]=useState<BulkResult[]>([]);
 const lock=useRef(false),rejected=useRef(new Set<string>()),router=useRouter();
 const chosen=items.filter(item=>selected.has(item.id));
 const running=chosen.some(item=>item.running),all=items.length>0&&chosen.length===items.length;
 function toggle(id:string){if(lock.current)return;setAction(null);setResults([]);setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 async function execute(){
  if(!action||!chosen.length||lock.current)return;
  lock.current=true;setBusy(true);setResults([]);
  const outcomes:BulkResult[]=[];
  const post=async(url:string,body:Record<string,unknown>)=>{
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||`저장 실패 (${response.status}). 새로고침 후 상태를 확인해 주세요.`);
  };
  for(const item of chosen){
   setProgress(`${outcomes.length+1} / ${chosen.length}건 처리 중`);
   const result=await applyBulkItem(item,action,reason,post,rejected.current.has(item.id));
   if(result.rejected&&!result.ok)rejected.current.add(item.id);else if(result.ok)rejected.current.delete(item.id);
   outcomes.push(result);
  }
  setResults(outcomes);setSelected(new Set(outcomes.filter(r=>!r.ok).map(r=>r.id)));
  setProgress(`${outcomes.filter(r=>r.ok).length}건 완료${outcomes.some(r=>!r.ok)?` · ${outcomes.filter(r=>!r.ok).length}건 확인 필요`:''}`);
  setAction(null);setBusy(false);lock.current=false;router.refresh();
 }
 return <Selection.Provider value={{selected,toggle,busy}}>
  <section className="ff-bulk-controls" aria-label="일괄 정리">
   <div className="ff-bulk-bar"><label><input type="checkbox" className="ff-bulk-checkbox" aria-label="현재 페이지 기획서 전체 선택" checked={all} ref={node=>{if(node)node.indeterminate=chosen.length>0&&!all;}} disabled={busy||!items.length} onChange={()=>{setAction(null);setResults([]);setSelected(all?new Set():new Set(items.map(i=>i.id)));}}/>현재 페이지 전체 선택</label><strong>{chosen.length}개 선택</strong>
   {chosen.length>0&&<button type="button" disabled={busy} onClick={()=>{setSelected(new Set());setAction(null);}}>선택 해제</button>}
   {(archived?['restore'] as const:['reject','archive','reject_archive'] as const).map(kind=><button key={kind} type="button" disabled={busy||!chosen.length||((kind==='reject'||kind==='reject_archive')&&running)} onClick={()=>{setAction(kind);setResults([]);setProgress('');}}>{labels[kind]}</button>)}</div>
   <p className="ff-bulk-hint">현재 페이지의 기획서만 선택됩니다. 보관한 항목은 보관함에서 복원할 수 있습니다.{running&&' 작성 중인 항목은 보관만 가능합니다.'}</p>
   {action&&<div className="ff-bulk-confirm"><h2>선택한 {chosen.length}개를 {labels[action]}할까요?</h2><p>{action==='reject'?'반려 의견을 기록하고 목록에는 남겨 둡니다.':action==='reject_archive'?'반려 의견을 기록한 뒤 보관함으로 옮깁니다.':action==='archive'?'본문과 판정 기록을 보존하고 보관함으로 옮깁니다.':'본문과 기존 판정 기록을 유지한 채 검토 목록으로 되돌립니다.'}</p><details><summary>처리할 작품 {chosen.length}개 보기</summary><ul>{chosen.map(i=><li key={i.id}>{i.title}</li>)}</ul></details><label>공통 메모 (선택)<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={2} disabled={busy}/></label><div><button type="button" disabled={busy} onClick={execute}>{busy?'처리 중…':`${chosen.length}개 ${labels[action]} 실행`}</button><button type="button" disabled={busy} onClick={()=>setAction(null)}>취소</button></div></div>}
   <p role="status" aria-live="polite">{progress}</p>
   {results.some(r=>!r.ok)&&<ul className="ff-bulk-errors" role="alert">{results.filter(r=>!r.ok).map(r=><li key={r.id}>{items.find(i=>i.id===r.id)?.title} — {r.rejected?'반려는 기록됨. ':''}{r.error}</li>)}</ul>}
  </section>{children}
 </Selection.Provider>;
}
