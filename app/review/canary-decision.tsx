"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function CanaryDecision({id,inputSha256,outputSha256,complete}:{id:string;inputSha256:string;outputSha256:string;complete:boolean}){
 const [comment,setComment]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const router=useRouter();
 async function submit(decision:string){setBusy(true);try{const response=await fetch("/api/firefly/canary-decisions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,inputSha256,outputSha256,decision,comment})});const result=await response.json();setMessage(response.ok?"판정을 기록했습니다. 칸반에도 반영됩니다.":result.error??"기록하지 못했습니다.");if(response.ok)router.refresh();}catch{setMessage("연결을 확인한 뒤 다시 시도해 주세요.");}finally{setBusy(false);}}
 return <section className="commercial-promise-card"><h2>내 판정</h2><label htmlFor="canary-comment">코멘트</label><textarea id="canary-comment" value={comment} onChange={e=>setComment(e.target.value)} maxLength={12000} rows={5} style={{width:"100%",padding:12,border:"1px solid #ddd",borderRadius:8}}/><div className="ff-review-view-nav"><button disabled={busy||!complete} onClick={()=>submit("select")}>채택 의견</button><button disabled={busy} onClick={()=>submit("hold")}>보류</button><button disabled={busy} onClick={()=>submit("reject")}>반려</button></div><p role="status">{message}</p><p>이 판정은 기획 검토 기록입니다. 원고 작성이나 InkOS 적용은 별도 진행합니다.</p></section>;
}
