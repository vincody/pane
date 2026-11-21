import type {ChatEvent} from './contracts.ts';

/**
 * Folds one event into an ordered transcript so a reconnecting view can be replayed without every delta:
 * text deltas merge into their row, a final text replaces the draft, and a tool result updates its running row.
 */
export function foldChatEvent(log:ChatEvent[],event:ChatEvent){
 if(event.type==='text'||event.type==='thinking'){
  const at=log.findLastIndex(item=>item.type===event.type&&item.id===event.id);
  if(at<0)log.push({...event});
  else{const old=log[at] as typeof event;log[at]={...old,text:event.type==='text'&&event.final?event.text:old.text+event.text,...(event.type==='text'&&event.final?{final:true}:{})} as ChatEvent;}
 }else if(event.type==='tool'){
  const at=log.findLastIndex(item=>item.type==='tool'&&item.id===event.id);
  if(at<0)log.push({...event});
  else{const old=log[at] as typeof event;log[at]={...old,status:event.status,name:event.name||old.name,input:event.input??old.input,...(event.output!==undefined?{output:event.output}:{})};}
 }else if(event.type==='permission-done'){
  const at=log.findLastIndex(item=>item.type==='permission'&&item.id===event.id);
  if(at>=0)log.splice(at,1);
 }else if(event.type==='user'){
  for(let at=log.length-1;at>=0;at--)if(log[at].type==='resume-cost')log.splice(at,1);
  log.push({...event});
 }else if(event.type==='turn'){
  const at=log.findLastIndex(item=>item.type==='turn'&&item.id===event.id);
  if(at>=0)log.splice(at,1);
  log.push(event);
 }else if(event.type==='limit'){
  const at=log.findLastIndex(item=>item.type==='limit'&&item.window===event.window);
  if(at>=0)log.splice(at,1);
  log.push(event);
 }else if(event.type==='title'){
  const at=log.findLastIndex(item=>item.type==='title');
  if(at>=0)log.splice(at,1);
  log.push(event);
 }else if(event.type==='status'){
  const at=log.findLastIndex(item=>item.type==='status');
  if(at>=0)log.splice(at,1);
  log.push(event);
 }else log.push(event);
 if(log.length>4000)log.splice(0,log.length-4000);
}
