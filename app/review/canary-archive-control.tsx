"use client";
import {useState} from "react";
export function CanaryArchiveControl({id,outputSha256,archived}:{id:string;outputSha256:string;archived:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <form className="commercial-promise-card" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const form=new FormData(e.currentTarget);try{const response=await fetch('/api/firefly/canary-archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,outputSha256,expectedArchived:archived,archived:!archived,reason:String(form.get('reason')||'')})});const data=await response.json();if(!response.ok)throw Error(data.error||'저장하지 못했습니다.');window.location.reload();}catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다.');setBusy(false);}}}><label>보관 메모 <input name="reason" maxLength={1000} placeholder="선택 사항"/></label> <button disabled={busy} type="submit">{busy?'저장 중…':archived?'검토 목록으로 복원':'검토 목록에서 보관'}</button><p>기획서 본문과 HIL 기록은 그대로 보존됩니다.</p>{error&&<p role="alert">{error}</p>}</form>;
}
