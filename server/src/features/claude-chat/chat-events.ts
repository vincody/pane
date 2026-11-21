import type {ChatEvent} from '../../../../shared/contracts.ts';
import {foldChatEvent} from '../../../../shared/chat-transcript.ts';
export {foldChatEvent};

type Row=Record<string,unknown>;
const isRow=(value:unknown):value is Row=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(isRow):[];
const str=(value:unknown)=>typeof value==='string'?value:'';
const MAX_OUTPUT=20_000;

/** Tool results arrive as a string or a list of content blocks; keep the readable text and cap its size. */
export function toolOutput(content:unknown):string{
 const text=typeof content==='string'?content:rows(content).map(block=>block.type==='text'?str(block.text):block.type==='image'?'[image]':'').filter(Boolean).join('\n');
 return text.length>MAX_OUTPUT?`${text.slice(0,MAX_OUTPUT)}\n… (${text.length-MAX_OUTPUT} more characters)`:text;
}

/**
 * Turns the Claude Agent SDK's message stream into the small event model the chat view renders.
 * Streaming deltas and the final assistant message share one id, so the view can replace the draft with the final text.
 */
export function createChatNormalizer(){
 let streamId='';
 return function normalize(message:unknown):ChatEvent[]{
  if(!isRow(message))return [];
  const out:ChatEvent[]=[];
  if(message.type==='system'&&message.subtype==='init'){
   // Not a turn boundary: the session keeps whatever state it is in and only learns the model and session id.
   out.push({type:'status',state:'starting',model:str(message.model)||undefined,sessionId:str(message.session_id)||undefined});
  }else if(message.type==='stream_event'&&isRow(message.event)&&message.parent_tool_use_id==null){
   const event=message.event;
   if(event.type==='message_start'&&isRow(event.message))streamId=str(event.message.id);
   else if(event.type==='content_block_delta'&&isRow(event.delta)&&streamId){
    if(event.delta.type==='text_delta'&&str(event.delta.text))out.push({type:'text',id:streamId,text:str(event.delta.text)});
    else if(event.delta.type==='thinking_delta'&&str(event.delta.thinking))out.push({type:'thinking',id:`${streamId}:thinking`,text:str(event.delta.thinking)});
   }
  }else if(message.type==='assistant'&&isRow(message.message)){
   const id=str(message.message.id)||str(message.uuid);
   // A subagent's own messages stay out of the main transcript.
   if(message.parent_tool_use_id!=null)return out;
   const blocks=rows(message.message.content);
   const text=blocks.filter(block=>block.type==='text').map(block=>str(block.text)).join('');
   if(text)out.push({type:'text',id,text,final:true});
   for(const block of blocks){
    if(block.type==='tool_use')out.push({type:'tool',id:str(block.id),name:str(block.name),input:block.input,status:'running'});
   }
  }else if(message.type==='user'&&isRow(message.message)&&message.parent_tool_use_id==null){
   for(const block of rows(message.message.content)){
    if(block.type==='tool_result')out.push({type:'tool',id:str(block.tool_use_id),name:'',input:undefined,status:block.is_error===true?'error':'done',output:toolOutput(block.content)});
   }
  }else if(message.type==='rate_limit_event'&&isRow(message.rate_limit_info)){
   const info=message.rate_limit_info,window=info.rateLimitType==='five_hour'||info.rateLimitType==='seven_day'?info.rateLimitType:null;
   if(window&&typeof info.utilization==='number'&&Number.isFinite(info.utilization)){
    const percent=info.utilization<=1?info.utilization*100:info.utilization,at=typeof info.resetsAt==='number'?(info.resetsAt<1e12?info.resetsAt*1000:info.resetsAt):null;
    out.push({type:'limit',window,usedPercent:percent,resetsAt:at});
   }
  }else if(message.type==='result'){
   const failed=message.is_error===true||str(message.subtype).startsWith('error');
   const detail=Array.isArray(message.errors)?message.errors.map(str).filter(Boolean).join('\n'):'';
   out.push({type:'status',state:failed?'error':'idle',...(failed?{message:str(message.result)||detail||'Claude could not finish this turn.'}:{}),...(typeof message.total_cost_usd==='number'?{costUsd:message.total_cost_usd}:{})});
  }
  return out;
 };
}

const INTERNAL_USER_TEXT=/^\s*<(?:command-|local-command|system-reminder|user-prompt-submit-hook)|^\s*Caveat: /;
/** What the user typed in a saved transcript message; tool results and CLI-injected notes are not messages. */
export function savedUserText(message:unknown):string{
 if(!isRow(message))return '';
 const content=message.content;
 const text=typeof content==='string'?content:rows(content).filter(block=>block.type==='text').map(block=>str(block.text)).join('\n');
 return INTERNAL_USER_TEXT.test(text)?'':text.trim();
}
/** Rebuilds the transcript of a resumed session from the messages the SDK reads out of Claude's own log. */
export function historyEvents(saved:{type:string;uuid:string;message:unknown;parent_tool_use_id?:string|null}[],times?:ReadonlyMap<string,number>):ChatEvent[]{
 const normalize=createChatNormalizer(),log:ChatEvent[]=[];
 // With the log's timestamps, each prompt-to-last-reply stretch gets its "Worked for" row back.
 let start=0,end=0,lastText='';
 const close=()=>{if(start&&lastText&&end>start)foldChatEvent(log,{type:'turn',id:lastText,ms:end-start,at:end});start=0;end=0;lastText='';};
 for(const item of saved){
  if(item.parent_tool_use_id)continue;
  if(item.type==='user'){
   const text=savedUserText(item.message);
   if(text){close();start=times?.get(item.uuid)||0;foldChatEvent(log,{type:'user',id:item.uuid,text});}
   for(const event of normalize({type:'user',message:item.message,parent_tool_use_id:null}))foldChatEvent(log,event);
  }else if(item.type==='assistant'){
   for(const event of normalize({type:'assistant',uuid:item.uuid,message:item.message,parent_tool_use_id:null})){foldChatEvent(log,event);if(event.type==='text')lastText=event.id;}
   end=times?.get(item.uuid)||end;
  }
 }
 close();
 return log;
}
