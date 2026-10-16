// OSC 52 lets a TUI such as Claude CLI copy to the host clipboard (`ESC ] 52 ; c ; <base64> BEL`); xterm.js does not implement it.
// A query (`?`) is ignored so a program cannot read the clipboard, and the payload is capped.
export type Osc52Result={kind:'write';text:string}|{kind:'ignored'};
const MAX_BASE64_CHARS=128*1024;

export function parseOsc52(data:string):Osc52Result{
 const separator=data.indexOf(';');
 if(separator===-1||!/^[cpqs0-7]*$/.test(data.slice(0,separator)))return {kind:'ignored'};
 const payload=data.slice(separator+1).replace(/\s+/g,'');
 if(!payload||payload==='?'||payload.length>MAX_BASE64_CHARS||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload))return {kind:'ignored'};
 try{
  const binary=atob(payload),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  const text=new TextDecoder().decode(bytes);
  return text?{kind:'write',text}:{kind:'ignored'};
 }catch{return {kind:'ignored'};}
}

// Recorded output replayed on reattach must not overwrite what the user copied since.
export function createOsc52Handler(options:{isReplaying:()=>boolean;write:((text:string)=>Promise<void>)|undefined;onFailure?:()=>void}){
 let pending:string|null=null,scheduled=false;
 const flush=()=>{
  scheduled=false;const text=pending;pending=null;
  if(text===null||!options.write)return;
  void options.write(text).catch(()=>options.onFailure?.());
 };
 return (data:string)=>{
  if(options.isReplaying())return true;
  const result=parseOsc52(data);
  // Only the last write in a burst is observable, so keep that one.
  if(result.kind==='write'){pending=result.text;if(!scheduled){scheduled=true;queueMicrotask(flush);}}
  return true;
 };
}
