import {marked} from 'marked';
import DOMPurify from 'dompurify';
import type {AccountQuota,Limit,ChatClientMessage,ChatCommand,ChatContextUsage,ChatEvent,ChatImage,ChatPermissionMode,ChatServerMessage,Workspace} from '../../../../shared/contracts.ts';
import {foldChatEvent} from '../../../../shared/chat-transcript.ts';
import type {NativeIcon} from '../../components/contracts.ts';
import {buildPermissionCard,isPlanTool,isQuestionTool} from './chat-permission-card.ts';
import {createApi} from '../../lib/api.ts';
import {MODE_HINTS,MODE_LABELS,chatTitle,toolDiff,toolSummary} from './chat-format.ts';

export interface ChatPaneState {state:string;sessionId?:string;title?:string;blocked?:boolean;completed?:boolean}
interface Options {host:HTMLElement;token:string;project:Workspace;icon:NativeIcon;sessionId?:string;resume?:boolean;onState:(state:ChatPaneState)=>void;onFocus:()=>void;onFork?:(sessionId:string)=>void;onNewChat?:()=>void}
type Row=Exclude<ChatEvent,{type:'status'|'permission-done'|'title'|'turn'|'resume-cost'|'limit'}>;
const MAX_RETRIES=5;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
const markdown=(text:string)=>DOMPurify.sanitize(marked.parse(text,{async:false,gfm:true,breaks:false}) as string,{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','iframe'],FORBID_ATTR:['style']});

/** A native chat with Claude: a transcript over a server-side structured session, with a composer, model and permission controls. */
// Streamed text reaches the screen a word at a time instead of in bursts: every chunk that arrives is spread
// over REVEAL_MS and only ends on word boundaries; words then fade in over FADE_MS.
const REVEAL_MS=350,FADE_MS=300;
interface Reveal {source:string;shown:number;arrivals:{from:number;to:number;at:number}[];painted:number;length:number;segments:{from:number;to:number;at:number}[];frame:number}
const SPACELESS=/[\u2e80-\ud7ff\uf900-\uffef]/u;
const endsWord=(char:string)=>/\s/.test(char)||SPACELESS.test(char);
function pacedEnd(text:string,position:number,holdPartial:boolean){
 const from=Math.floor(position);if(from>=text.length)return text.length;
 let end=from;while(end<text.length&&!endsWord(text[end]))end++;
 if(end<text.length||!holdPartial)return end;
 let start=from;while(start>0&&!endsWord(text[start-1]))start--;return start;
}
function advance(reveal:Reveal,now:number){
 let position=reveal.arrivals[0]?.from??reveal.shown,due=reveal.shown;
 for(const arrival of reveal.arrivals){const fraction=Math.min(1,Math.max(0,(now-arrival.at)/REVEAL_MS));position+=(arrival.to-arrival.from)*fraction;if(fraction===1)due=Math.max(due,arrival.to);}
 reveal.shown=Math.max(reveal.shown,due,pacedEnd(reveal.source,position,due<reveal.source.length));
 reveal.arrivals=reveal.arrivals.filter(arrival=>arrival.at+REVEAL_MS>now);
}
/** Wraps the freshly revealed characters so they fade in; the delay is negative so a repaint continues the fade instead of restarting it. */
function fadeIn(root:HTMLElement,segments:Reveal['segments'],now:number){
 for(const segment of segments){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),found:{node:Text;start:number}[]=[];let offset=0;
  for(let node=walker.nextNode() as Text|null;node;node=walker.nextNode() as Text|null){found.push({node,start:offset});offset+=node.data.length;}
  for(const {node,start} of found.reverse()){
   const a=Math.max(segment.from,start)-start,b=Math.min(segment.to,start+node.data.length)-start;
   if(b<=a)continue;
   const middle=a>0?node.splitText(a):node;if(b-a<middle.data.length)middle.splitText(b-a);
   const span=document.createElement('span');span.className='chat-fade';span.style.animationDelay=`-${Math.round(now-segment.at)}ms`;middle.replaceWith(span);span.append(middle);
  }
 }
}

export function setupChatPane({host,token,project,icon,sessionId,resume=false,onState,onFocus,onFork,onNewChat}:Options){
 host.classList.add('chat-host');
 host.innerHTML='<div class="chat-scroll" tabindex="-1"><div class="chat-column"><div class="chat-empty"><span class="chat-empty-mark"></span><strong>Start a chat with Claude</strong><span>Ask Claude to inspect code, explain output, or make a change.</span></div><div class="chat-rows" role="log" aria-live="polite" aria-label="Conversation"></div></div></div><div class="chat-dock"><div class="chat-resume" role="alertdialog" aria-label="Resume this conversation?" hidden></div><div class="chat-notice" role="alert" hidden></div><form class="chat-composer"><div class="chat-suggest" role="listbox" aria-label="Suggestions" hidden></div><div class="chat-attachments" hidden></div><textarea rows="1" placeholder="Ask anything, @ to mention files, / for commands" aria-label="Message Claude" spellcheck="true"></textarea><div class="chat-composer-bar"><button type="button" class="chat-plus" aria-label="Mention a file" title="Mention a file (@)"></button><select class="chat-mode" aria-label="Permission mode"></select><span class="chat-spacer"></span><select class="chat-model" aria-label="Model" hidden></select><button type="submit" class="chat-send" aria-label="Send message" title="Send (Enter)"></button></div></form><div class="chat-footer"></div></div>';
 const scroll=host.querySelector<HTMLElement>('.chat-scroll')!,rowsHost=host.querySelector<HTMLElement>('.chat-rows')!,empty=host.querySelector<HTMLElement>('.chat-empty')!;
 const notice=host.querySelector<HTMLElement>('.chat-notice')!,form=host.querySelector<HTMLFormElement>('.chat-composer')!,input=form.querySelector<HTMLTextAreaElement>('textarea')!;
 const modeSelect=form.querySelector<HTMLSelectElement>('.chat-mode')!,modelSelect=form.querySelector<HTMLSelectElement>('.chat-model')!,sendButton=form.querySelector<HTMLButtonElement>('.chat-send')!;
 host.querySelector('.chat-empty-mark')!.append(icon('chat'));
 const footer=host.querySelector<HTMLElement>('.chat-footer')!;
 {const item=el('span','chat-footer-item');item.append(icon('folder'),el('span','',project.name));footer.append(item);}
 const branchWrap=el('div','chat-dropdown chat-branch'),branchButton=el('button','chat-footer-item chat-branch-button'),branchLabel=el('span','',project.branch||'');
 branchButton.type='button';branchButton.setAttribute('aria-haspopup','dialog');branchButton.setAttribute('aria-expanded','false');branchButton.title='Switch branch';branchButton.append(icon('branch'),branchLabel);
 const branchPop=el('div','chat-menu chat-select-menu chat-picker chat-branch-pop');branchPop.hidden=true;
 const branchSearch=document.createElement('input');branchSearch.type='search';branchSearch.placeholder='Search branches…';branchSearch.setAttribute('aria-label','Search branches');branchSearch.className='chat-picker-search';
 const branchSearchRow=el('div','chat-picker-searchrow');branchSearchRow.append(icon('search'),branchSearch);
 const branchList=el('div','chat-picker-list');branchPop.append(branchSearchRow,branchList);branchWrap.append(branchButton,branchPop);branchWrap.hidden=!project.branch;footer.append(branchWrap);
 let branchData:{name:string;remote:boolean;when:string;checkedOut:boolean}[]=[],branchNow=project.branch||'';
 const branchAuth={'X-AI-Web-Token':token};
 function paintBranches(){
  const query=branchSearch.value.trim().toLowerCase();branchList.replaceChildren();
  const shown=branchData.filter(item=>!query||item.name.toLowerCase().includes(query));
  if(!shown.length)branchList.append(el('div','chat-picker-empty',branchData.length?'No branches match.':'Loading branches…'));
  for(const item of shown){
   const row=el('button','chat-picker-item chat-branch-item');row.type='button';row.setAttribute('role','option');row.setAttribute('aria-selected',String(item.name===branchNow));row.disabled=item.checkedOut;
   row.append(el('span','chat-menu-name',item.name),el('span','chat-branch-note',item.name===branchNow?'':item.checkedOut?'In another workspace':item.remote?'remote':item.when));
   if(item.name===branchNow)row.append(icon('check'));
   row.onclick=async()=>{
    if(item.name===branchNow){branchPop.hidden=true;return;}
    try{
     const response=await fetch(`/api/branches?${new URLSearchParams({project:project.id})}`,{method:'POST',headers:{...branchAuth,'Content-Type':'application/json'},body:JSON.stringify({branch:item.name})});
     const data=await response.json() as {current?:string;branches?:typeof branchData;error?:string;message?:string};
     if(!response.ok)throw new Error(data.error||data.message||'Could not switch branch.');
     branchNow=data.current||item.name;branchLabel.textContent=branchNow;project.branch=branchNow;branchData=data.branches||branchData;branchPop.hidden=true;branchButton.setAttribute('aria-expanded','false');
    }catch(error){showNotice(error instanceof Error?error.message:'Could not switch branch.');branchPop.hidden=true;}
   };
   branchList.append(row);
  }
 }
 branchButton.onclick=async()=>{
  const open=branchPop.hidden;branchPop.hidden=!open;branchButton.setAttribute('aria-expanded',String(open));if(!open)return;
  branchSearch.value='';branchSearch.focus();paintBranches();
  try{const response=await fetch(`/api/branches?${new URLSearchParams({project:project.id})}`,{headers:branchAuth});if(!response.ok)return;const data=await response.json() as {current:string;branches:typeof branchData};branchData=data.branches;branchNow=data.current||branchNow;paintBranches();}catch{/* Shows the empty list. */}
 };
 branchSearch.addEventListener('input',paintBranches);
 document.addEventListener('pointerdown',event=>{if(!event.isTrusted)return;if(!branchPop.hidden&&!branchWrap.contains(event.target as Node)){branchPop.hidden=true;branchButton.setAttribute('aria-expanded','false');}});
 branchWrap.addEventListener('keydown',event=>{if(event.key==='Escape'&&!branchPop.hidden){branchPop.hidden=true;event.stopPropagation();branchButton.focus();}});
 const plus=form.querySelector<HTMLButtonElement>('.chat-plus')!;plus.append(icon('plus'));
 const menu=el('div','chat-menu');menu.setAttribute('role','menu');menu.hidden=true;form.append(menu);
 const insertAt=(token:string)=>{const at=input.selectionStart??input.value.length,lead=at>0&&!/\s/.test(input.value[at-1])?' ':'';input.value=input.value.slice(0,at)+lead+token+input.value.slice(at);const caret=at+lead.length+token.length;input.focus();input.setSelectionRange(caret,caret);autosize();syncControls();updateSuggest();};
 const closeMenu=()=>{menu.hidden=true;plus.setAttribute('aria-expanded','false');};
 for(const [name,label,hint,run] of [['image','Add photos','Ctrl+U',()=>picker.click()],['at','Mention a file','@',()=>insertAt('@')],['slash','Slash commands','/',()=>{input.value='/';input.focus();autosize();syncControls();updateSuggest();}]] as [string,string,string,()=>void][]){
  const item=el('button','chat-menu-item');item.type='button';item.setAttribute('role','menuitem');item.append(icon(name),el('span','',label),el('kbd','',hint));
  item.onclick=()=>{closeMenu();run();};menu.append(item);
 }
 plus.setAttribute('aria-haspopup','menu');plus.setAttribute('aria-expanded','false');plus.setAttribute('aria-label','Add');plus.title='Add photos, files or commands';
 plus.onclick=()=>{const open=menu.hidden;menu.hidden=!open;plus.setAttribute('aria-expanded',String(open));};
 document.addEventListener('pointerdown',event=>{if(!event.isTrusted)return;if(!menu.hidden&&!menu.contains(event.target as Node)&&!plus.contains(event.target as Node))closeMenu();});
 host.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){closeMenu();event.stopPropagation();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='u'){event.preventDefault();picker.click();}});
 for(const [value,label] of Object.entries(MODE_LABELS)){const option=el('option','',label);option.value=value;modeSelect.append(option);}
// A new chat starts in the mode last picked; an existing one keeps what the server saved for it.
 const MODE_KEY='ai-web.chat-mode';
 const savedMode=():ChatPermissionMode|undefined=>{try{const value=localStorage.getItem(MODE_KEY);return value&&value in MODE_LABELS?value as ChatPermissionMode:undefined;}catch{return undefined;}};
 const startMode=!sessionId&&!resume?savedMode():undefined;
 modeSelect.value=startMode||'default';
 // The native selects hold the state; styled menus drive them.
 function dropdown(select:HTMLSelectElement,label:string,title:string,hint:(option:HTMLOptionElement)=>string){
  select.hidden=true;select.removeAttribute('aria-label');
  const wrap=el('div','chat-dropdown'),trigger=el('button','chat-trigger'),text=el('span','');trigger.type='button';trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  const caret=icon('chevron-down');trigger.append(text,caret);
  const pop=el('div','chat-menu chat-select-menu');pop.setAttribute('role','menu');pop.hidden=true;
  const close=()=>{pop.hidden=true;trigger.setAttribute('aria-expanded','false');};
  const refresh=()=>{text.textContent=select.selectedOptions[0]?.textContent||'';wrap.hidden=!select.options.length;};
  const build=()=>{
   pop.replaceChildren(el('div','chat-menu-title',title));
   for(const option of [...select.options]){
    const item=el('button','chat-menu-item chat-menu-choice');item.type='button';item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(option.value===select.value));
    const body=el('span','chat-menu-text'),note=hint(option);body.append(el('span','chat-menu-name',option.textContent||option.value));if(note)body.append(el('span','chat-menu-note',note));
    item.append(body);if(option.value===select.value)item.append(icon('check'));
    item.onclick=()=>{close();if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event('change'));}refresh();};pop.append(item);
   }
  };
  trigger.onclick=()=>{const open=pop.hidden;if(open)build();pop.hidden=!open;trigger.setAttribute('aria-expanded',String(open));};
  document.addEventListener('pointerdown',event=>{if(!event.isTrusted)return;if(!pop.hidden&&!wrap.contains(event.target as Node))close();});
  wrap.addEventListener('keydown',event=>{if(event.key==='Escape'&&!pop.hidden){close();event.stopPropagation();trigger.focus();}});
  select.addEventListener('sync',refresh);select.addEventListener('change',refresh);
  wrap.append(trigger,pop);select.before(wrap);refresh();
 }
 dropdown(modeSelect,'Permission mode','Mode',option=>MODE_HINTS[option.value as keyof typeof MODE_HINTS]||'');
 // Model picker: a search box, every model with its description, and the effort bar underneath.
 function modelMenu(){
  modelSelect.hidden=true;modelSelect.removeAttribute('aria-label');
  const wrap=el('div','chat-dropdown'),trigger=el('button','chat-trigger'),text=el('span',''),level=el('span','chat-trigger-level');
  trigger.type='button';trigger.setAttribute('aria-label','Model');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.append(text,level,icon('chevron-down'));
  const pop=el('div','chat-menu chat-select-menu chat-model-menu chat-picker');pop.hidden=true;
  const search=document.createElement('input');search.type='search';search.placeholder='Search models…';search.setAttribute('aria-label','Search models');search.className='chat-picker-search';
  const searchRow=el('div','chat-picker-searchrow');searchRow.append(icon('search'),search);
  const list=el('div','chat-picker-list');list.setAttribute('role','listbox');
  const bar=el('div','chat-effort-bar');
  pop.append(searchRow,list,bar);
  let effort='',ultracode=false;
  const EFFORTS:[string,string][]=[['low','Low'],['medium','Med'],['high','High'],['xhigh','XHigh'],['max','Max']];
  const efforts=()=>{const allowed=(modelSelect.selectedOptions[0]?.dataset.efforts||'').split(',').filter(Boolean);return EFFORTS.filter(([value])=>allowed.includes(value));};
  const shortLabel=(value:string)=>EFFORTS.find(([key])=>key===value)?.[1]||'';
  const close=()=>{pop.hidden=true;trigger.setAttribute('aria-expanded','false');};
  const refresh=()=>{text.textContent=modelSelect.selectedOptions[0]?.textContent||'';level.textContent=ultracode?'Ultracode':shortLabel(effort);wrap.hidden=!modelSelect.options.length;};
  const choose=(value:string)=>{close();if(modelSelect.value!==value){modelSelect.value=value;modelSelect.dispatchEvent(new Event('change'));}refresh();};
  function buildList(){
   const query=search.value.trim().toLowerCase();list.replaceChildren();
   const matches=[...modelSelect.options].filter(option=>!query||`${option.textContent} ${option.title}`.toLowerCase().includes(query));
   if(!matches.length)list.append(el('div','chat-picker-empty','No models match.'));
   for(const option of matches){
    const item=el('button','chat-picker-item');item.type='button';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.value===modelSelect.value));
    const body=el('span','chat-menu-text');body.append(el('span','chat-menu-name',option.textContent||option.value));if(option.title)body.append(el('span','chat-menu-note',option.title));
    item.append(body);if(option.value===modelSelect.value)item.append(icon('check'));item.onclick=()=>choose(option.value);list.append(item);
   }
  }
  function buildBar(){
   bar.replaceChildren();const levels=efforts();bar.hidden=!levels.length;if(!levels.length)return;
   bar.append(el('span','chat-effort-label','Effort'));
   for(const [value,label] of levels){const chip=el('button','chat-effort-chip',label);chip.type='button';chip.setAttribute('aria-pressed',String(value===effort));chip.onclick=()=>{effort=value;send({type:'set-effort',effort:value});refresh();buildBar();};bar.append(chip);}
   const ultra=el('button','chat-effort-chip','Ultracode');ultra.type='button';ultra.setAttribute('aria-pressed',String(ultracode));ultra.onclick=()=>{ultracode=!ultracode;send({type:'set-effort',ultracode});refresh();buildBar();};bar.append(ultra);
  }
  trigger.onclick=()=>{const open=pop.hidden;if(open){search.value='';buildList();buildBar();}pop.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)search.focus();};
  search.addEventListener('input',buildList);
  document.addEventListener('pointerdown',event=>{if(!event.isTrusted)return;if(!pop.hidden&&!wrap.contains(event.target as Node))close();});
  wrap.addEventListener('keydown',event=>{if(event.key==='Escape'&&!pop.hidden){close();event.stopPropagation();trigger.focus();}});
  modelSelect.addEventListener('sync',refresh);modelSelect.addEventListener('change',refresh);
  modelSelect.addEventListener('restore-effort',event=>{const saved=(event as CustomEvent<{effort?:string;ultracode?:boolean}>).detail;effort=saved.effort||'';ultracode=Boolean(saved.ultracode);refresh();});
  wrap.append(trigger,pop);modelSelect.before(wrap);refresh();
 }
 modelMenu();
 // Context ring: how full the window is, with the breakdown on click.
 const ringWrap=el('div','chat-dropdown chat-context');const ring=el('button','chat-ring');ring.type='button';ring.setAttribute('aria-label','Context usage');ring.setAttribute('aria-haspopup','dialog');ring.setAttribute('aria-expanded','false');
 const ringPop=el('div','chat-menu chat-select-menu chat-context-pop');ringPop.hidden=true;ringWrap.append(ring,ringPop);const contextBox=el('div','chat-context-box');ringPop.append(contextBox);contextBox.append(el('div','chat-context-note chat-context-empty','Context usage appears after Claude replies.'));
 const tokens=(value:number)=>value>=1000?`${(value/1000).toFixed(value>=100000?0:1)}k`:String(value);
 const percent=(value:number,max:number)=>max?`${(value/max*100).toFixed(1)}%`:'0%';
 function paintRing(usage?:ChatContextUsage){
  const ratio=usage&&usage.max?Math.min(1,usage.categories.filter(item=>item.kind==='used').reduce((sum,item)=>sum+item.tokens,0)/usage.max):0;
  ring.style.setProperty('--ratio',String(ratio));ring.dataset.level=ratio>.85?'high':ratio>.6?'mid':'low';
  if(!usage){if(!contextBox.childElementCount)contextBox.append(el('div','chat-context-note chat-context-empty','Context usage appears after Claude replies.'));return;}
  contextBox.replaceChildren();
  const used=usage.categories.filter(item=>item.kind==='used').reduce((sum,item)=>sum+item.tokens,0);
  const head=el('div','chat-context-head');head.append(el('strong','','Context'),el('span','',`${tokens(used)}/${tokens(usage.max)}`));
  const track=el('div','chat-context-track'),fill=el('div','chat-context-fill');fill.style.width=`${ratio*100}%`;track.append(fill);contextBox.append(head,track);
  const row=(label:string,value:string)=>{const line=el('div','chat-context-row');line.append(el('span','',label),el('span','',value));return line;};
  const free=usage.categories.find(item=>item.kind==='free');if(free)contextBox.append(row('Free space',percent(free.tokens,usage.max)));
  for(const item of usage.categories.filter(entry=>entry.kind==='buffer'||entry.kind==='used'))if(item.tokens>0)contextBox.append(row(item.name,percent(item.tokens,usage.max)));
  const deferred=usage.categories.filter(item=>item.kind==='deferred'&&item.tokens>0);
  if(deferred.length){contextBox.append(el('div','chat-context-note','Loaded on demand. Not counted in the used total.'));for(const item of deferred)contextBox.append(row(item.name,tokens(item.tokens)));}
 }
 // The account's 5-hour and weekly limits sit in the footer beside the folder and branch, with their 12-hour reset clock times.
 const accountApi=createApi(token),limitsBox=el('span','chat-footer-limits');footer.append(limitsBox);
 const resetText=(iso?:string|null)=>{
  const at=iso?new Date(iso):null;if(!at||Number.isNaN(at.getTime()))return '';
  const minutes=Math.max(0,Math.ceil((at.getTime()-Date.now())/60000)),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
  return days?`${days}d ${hours}h`:hours?`${hours}h ${minutes%60}m`:`${minutes}m`;
 };
 function paintLimits(quota?:AccountQuota|null){
  limitsBox.replaceChildren();
  const limits:[string,Limit|null|undefined][]=[['5h',quota?.fiveHour],['Weekly',quota?.weekly]];
  for(const [label,limit] of limits){
   if(!limit||!Number.isFinite(limit.usedPercent)||limit.resetsAt&&!(Date.parse(limit.resetsAt)>Date.now()))continue;
   const used=Math.round(Math.max(0,Math.min(100,limit.usedPercent))),reset=resetText(limit.resetsAt),item=el('span','chat-footer-item chat-footer-limit');
   item.dataset.level=used>=90?'high':used>=70?'mid':'low';
   item.title=`${label==='5h'?'5-hour':'Weekly'} limit: ${used}% used${reset?`, resets in ${reset}`:''}${limit.resetsAt?` (${new Date(limit.resetsAt).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',hour12:true})})`:''}`;
   item.append(el('span','chat-footer-limit-label',label),el('span','chat-footer-limit-value',`${used}%`));
   if(reset)item.append(el('span','chat-footer-limit-reset',reset));
   limitsBox.append(item);
  }
  if(!limitsBox.childElementCount){const note=el('span','chat-footer-item chat-footer-limit-note','Usage limits unavailable');note.title=quota?.message||'Usage limits could not be read right now.';limitsBox.append(note);}
 }
 let limitsLoading=false,limitsAt=0,liveQuota:AccountQuota={provider:'claude',available:true,fiveHour:null,weekly:null,stale:false,updatedAt:null,message:''} as AccountQuota;
 const limitClock=setInterval(()=>{if(!destroyed&&limitsBox.querySelector('.chat-footer-limit'))paintLimits(liveQuota);},60_000);
 async function loadLimits(){
  if(limitsLoading||destroyed||Date.now()-limitsAt<60_000)return;limitsLoading=true;
  try{const result=await accountApi<{providers:AccountQuota[]}>('/api/account-usage?providers=claude');const quota=result.providers.find(item=>item.provider==='claude');if(quota?.available)liveQuota={...liveQuota,...quota};paintLimits(quota);limitsAt=Date.now();if(!limitsBox.querySelector('.chat-footer-limit'))setTimeout(()=>{limitsAt=0;void loadLimits();},120_000);}
  catch{paintLimits(null);}
  finally{limitsLoading=false;}
 }
 const askContext=()=>send({type:'get-context'});
 ring.onclick=()=>{const open=ringPop.hidden;ringPop.hidden=!open;ring.setAttribute('aria-expanded',String(open));if(open)askContext();};
 document.addEventListener('pointerdown',event=>{if(!event.isTrusted)return;if(!ringPop.hidden&&!ringWrap.contains(event.target as Node)){ringPop.hidden=true;ring.setAttribute('aria-expanded','false');}});
 sendButton.before(ringWrap);

 let socket:WebSocket|null=null,id=sessionId,hasTurn=resume,retries=0,destroyed=false,retryTimer:ReturnType<typeof setTimeout>|undefined,ready=false;
 let state='starting',titled=false,finished=false;
 const attachments:ChatImage[]=[];let commands:ChatCommand[]=[];
 const queue:{text:string;images:ChatImage[]}[]=[];
 const rows:ChatEvent[]=[],elements=new Map<string,HTMLElement>(),permissions=new Set<string>();
 const working=()=>state==='working';

 function send(message:ChatClientMessage){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
 const resumeBox=host.querySelector<HTMLElement>('.chat-resume')!;
 function hideResume(){resumeBox.hidden=true;resumeBox.replaceChildren();}
 function showResume(event:Extract<ChatEvent,{type:'resume-cost'}>){
  const minutes=Math.round(event.inactiveMs/60000),age=minutes>=1440?`${Math.round(minutes/1440)} days`:minutes>=60?`${Math.round(minutes/60)} hours`:`${minutes} minutes`,tokens=event.tokens>=1000?`${Math.round(event.tokens/1000)}k`:String(event.tokens);
  const title=el('strong','',`This session is ${age} old and ${tokens} tokens.`),detail=el('span','',`Resuming the full session uses about ${event.percent}% of your 5-hour usage limit. Resuming from a summary uses less.`),actions=el('div','chat-resume-actions');
  const choice=(label:string,run:()=>void,primary=false)=>{const button=el('button',`chat-permission-button${primary?' primary':''}`,label);button.type='button';button.onclick=run;actions.append(button);};
  choice('Resume from summary (recommended)',()=>{hideResume();send({type:'send',text:'/compact'});state='working';syncControls();},true);
  choice('Resume full session as-is',hideResume);
  if(onNewChat)choice('Start a new conversation',()=>{hideResume();onNewChat();});
  resumeBox.replaceChildren(title,detail,actions);resumeBox.hidden=false;
 }
 function showNotice(message:string){notice.textContent=message;notice.hidden=!message;}
 function syncControls(){
  const busy=working(),typed=Boolean(input.value.trim())||attachments.length>0,stopping=busy&&!typed;
  sendButton.replaceChildren(icon(stopping?'stop':'arrow-up'));sendButton.setAttribute('aria-label',stopping?'Stop':busy?'Queue message':'Send message');sendButton.title=stopping?'Stop (Esc)':busy?'Queue until Claude finishes (Enter)':'Send (Enter)';
  sendButton.dataset.mode=stopping?'stop':'send';sendButton.disabled=!ready||(!busy&&!typed);
  host.dataset.state=state;
 }
 function nearBottom(){return scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<80;}

 const keyOf=(row:ChatEvent)=>'id' in row?`${row.type}:${row.id}`:row.type;
 const duration=(ms:number)=>{const total=Math.max(0,Math.round(ms/1000));if(total<60)return `${total}s`;const minutes=Math.floor(total/60);return minutes<60?`${minutes}m ${total%60}s`:`${Math.floor(minutes/60)}h ${minutes%60}m`;};
 // Fenced code blocks get a copy button once rendered.
 function decorateCode(target:HTMLElement){
  for(const block of target.querySelectorAll<HTMLElement>('pre')){
   if(block.parentElement?.classList.contains('chat-code'))continue;
   const wrap=el('div','chat-code'),button=el('button','chat-code-copy');button.type='button';button.title='Copy code';button.setAttribute('aria-label','Copy code');button.append(icon('copy'));
   button.onclick=()=>{void navigator.clipboard?.writeText(block.textContent||'').then(()=>{button.replaceChildren(icon('check'));setTimeout(()=>button.replaceChildren(icon('copy')),1200);});};
   block.replaceWith(wrap);wrap.append(block,button);
  }
 }
 const reveals=new Map<string,Reveal>();let live=false;
 const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function paint(reveal:Reveal,target:HTMLElement){
  const now=performance.now();
  target.innerHTML=markdown(reveal.source.slice(0,reveal.shown));decorateCode(target);
  const length=target.textContent?.length||0;
  if(live&&!reducedMotion&&length>reveal.length&&reveal.painted<reveal.shown)reveal.segments.push({from:reveal.length,to:length,at:now});
  reveal.length=Math.max(reveal.length,length);reveal.painted=reveal.shown;
  reveal.segments=reveal.segments.filter(segment=>now-segment.at<FADE_MS);
  if(reveal.segments.length)fadeIn(target,reveal.segments,now);
 }
 function receive(id:string,text:string,target:HTMLElement){
  let reveal=reveals.get(id);const now=performance.now();
  if(!reveal){reveal={source:'',shown:0,arrivals:[],painted:-1,length:0,segments:[],frame:0};reveals.set(id,reveal);
   if(!live||reducedMotion){reveal.source=text;reveal.shown=text.length;}}
  if(text!==reveal.source){
   if(!text.startsWith(reveal.source)||!live||reducedMotion){reveal.source=text;reveal.shown=text.length;reveal.arrivals=[];}
   else{reveal.arrivals.push({from:reveal.source.length,to:text.length,at:now});reveal.source=text;}
  }
  const step=()=>{
   reveal!.frame=0;advance(reveal!,performance.now());
   if(reveal!.painted!==reveal!.shown)paint(reveal!,target);
   if(stickNext)scroll.scrollTop=scroll.scrollHeight;
   if(reveal!.shown<reveal!.source.length)reveal!.frame=requestAnimationFrame(step);
  };
  if(!reveal.frame){reveal.frame=requestAnimationFrame(step);}
  if(reveal.painted<0){advance(reveal,now);paint(reveal,target);}
 }
 let stickNext=true;
 const runOpen=new Set<string>();
 const CATEGORY:Record<string,string>={Read:'read',NotebookRead:'read',Grep:'search',Glob:'search',Bash:'command',PowerShell:'command',Edit:'edit',MultiEdit:'edit',Write:'edit',NotebookEdit:'edit',WebFetch:'web',WebSearch:'web',Task:'agent',Agent:'agent',TodoWrite:'plan'};
 const WORDS:Record<string,[string,string,string,string]>={read:['Read','Reading','file','files'],search:['Searched','Searching','time','times'],command:['Ran','Running','command','commands'],edit:['Edited','Editing','file','files'],web:['Used the web','Using the web','time','times'],agent:['Ran','Running','agent','agents'],plan:['Updated the plan','Updating the plan','time','times'],tool:['Used','Using','tool','tools']};
 function runSentence(tools:Extract<Row,{type:'tool'}>[]){
  const live=tools.some(tool=>tool.status==='running'),counts=new Map<string,number>();
  for(const tool of tools){const kind=CATEGORY[tool.name]||'tool';counts.set(kind,(counts.get(kind)||0)+1);}
  const parts=[...counts].map(([kind,count])=>{const [past,present,one,many]=WORDS[kind];return `${live?present:past} ${count} ${count===1?one:many}`;});
  const text=parts.map((part,index)=>index?part[0].toLowerCase()+part.slice(1):part).join(', ');return live?`${text}…`:text;
 }
 function buildRun(key:string){
  const node=el('button','chat-row chat-run');node.type='button';node.append(el('span','chat-tool-mark'),el('span','chat-run-text'));
  node.onclick=()=>{if(runOpen.has(key))runOpen.delete(key);else runOpen.add(key);schedule();};return node;
 }
 function updateRun(node:HTMLElement,key:string,tools:Extract<Row,{type:'tool'}>[]){
  node.dataset.status=tools.some(tool=>tool.status==='running')?'running':tools.some(tool=>tool.status==='error')?'error':'done';
  node.setAttribute('aria-expanded',String(runOpen.has(key)));node.querySelector('.chat-run-text')!.textContent=runSentence(tools);
 }
 function build(row:Row):HTMLElement{
  if(row.type==='user'){const node=el('div','chat-row chat-user');node.append(el('div','chat-bubble'));return node;}
  if(row.type==='text'){const node=el('div','chat-row chat-assistant');const head=el('div','chat-turn-head');head.hidden=true;const actions=el('div','chat-actions');actions.hidden=true;
   const copy=el('button','chat-action');copy.type='button';copy.title='Copy';copy.setAttribute('aria-label','Copy message');copy.append(icon('copy'));
   copy.onclick=()=>{const source=node.querySelector<HTMLElement>('.chat-md')?.dataset.source||'';void navigator.clipboard?.writeText(source).then(()=>{copy.replaceChildren(icon('check'));setTimeout(()=>copy.replaceChildren(icon('copy')),1200);});};
   const fork=el('button','chat-action');fork.type='button';fork.title='Fork chat from here';fork.setAttribute('aria-label','Fork chat');fork.append(icon('branch'));fork.onclick=()=>send({type:'fork'});
   actions.append(copy,fork,el('span','chat-time'));node.append(head,el('div','chat-md'),actions);return node;}
  if(row.type==='thinking'){const node=el('details','chat-row chat-thinking');node.append(el('summary','','Thinking'),el('div','chat-thinking-body'));return node;}
  if(row.type==='tool'){const node=el('details','chat-row chat-tool');const summary=el('summary'),mark=el('span','chat-tool-mark'),name=el('span','chat-tool-name'),line=el('span','chat-tool-line');summary.append(mark,name,line);node.append(summary,el('div','chat-diff'),el('pre','chat-tool-input'),el('pre','chat-tool-output'));return node;}
  return buildPermissionCard(row,{send,icon});
 }
 function update(node:HTMLElement,row:Row){
  if(row.type==='user')node.querySelector('.chat-bubble')!.textContent=row.text+(row.images?`${row.text?'\n':''}[${row.images} image${row.images>1?'s':''}]`:'');
  else if(row.type==='text'){const target=node.querySelector<HTMLElement>('.chat-md')!;if(target.dataset.source!==row.text){target.dataset.source=row.text;stickNext=nearBottom();receive(row.id,row.text,target);}node.dataset.final=String(Boolean(row.final));
   const turn=rows.findLast(item=>item.type==='turn'&&item.id===row.id);const head=node.querySelector<HTMLElement>('.chat-turn-head')!,actions=node.querySelector<HTMLElement>('.chat-actions')!;
   head.hidden=turn?.type!=='turn';actions.hidden=turn?.type!=='turn';
   if(turn?.type==='turn'){head.textContent=`Worked for ${duration(turn.ms)}`;actions.querySelector('.chat-time')!.textContent=new Date(turn.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}}
  else if(row.type==='thinking')node.querySelector('.chat-thinking-body')!.textContent=row.text;
  else if(row.type==='tool'){
   node.dataset.status=row.status;
   node.querySelector('.chat-tool-name')!.textContent=row.name||'Tool';
   node.querySelector('.chat-tool-line')!.textContent=toolSummary(row.name,row.input);
   const detail=row.input===undefined?'':typeof (row.input as {command?:unknown})?.command==='string'?(row.input as {command:string}).command:JSON.stringify(row.input,null,2);
   const diff=toolDiff(row.name,row.input),diffNode=node.querySelector<HTMLElement>('.chat-diff')!;
   diffNode.hidden=!diff;
   if(diff&&diffNode.dataset.size!==String(diff.length)){diffNode.dataset.size=String(diff.length);diffNode.replaceChildren(...diff.map(line=>{const item=el('div','chat-diff-line',`${line.kind==='add'?'+':line.kind==='del'?'-':' '} ${line.text}`);item.dataset.kind=line.kind;return item;}));}
   const inputNode=node.querySelector<HTMLElement>('.chat-tool-input')!;inputNode.textContent=detail;inputNode.hidden=!detail||Boolean(diff);
   const out=node.querySelector<HTMLElement>('.chat-tool-output')!;out.textContent=row.output||'';out.hidden=!row.output;
  }
 }
 function render(){
  const stick=nearBottom(),seen=new Set<string>();let previous:Element|null=null;
  const asking=new Set(rows.filter(row=>row.type==='permission'&&(isQuestionTool(row.tool)||isPlanTool(row.tool))).map(row=>(row as {id:string}).id));
  const visible=rows.filter(row=>!(row.type==='tool'&&asking.has(row.id))&&!(row.type==='status'||row.type==='permission-done'||row.type==='title'||row.type==='turn'||row.type==='resume-cost'||row.type==='limit')) as Row[];
  const place=(key:string,node:HTMLElement)=>{seen.add(key);if(previous?previous.nextElementSibling!==node:rowsHost.firstElementChild!==node)rowsHost.insertBefore(node,previous?previous.nextElementSibling:rowsHost.firstElementChild);previous=node;};
  for(let at=0;at<visible.length;){
   const row=visible[at];let end=at;
   // Like Orca, several tool calls in a row fold into one sentence ("Ran 4 commands") that opens to the calls.
   if(row.type==='tool')while(end<visible.length&&visible[end].type==='tool')end++;
   const run=row.type==='tool'&&end-at>1?visible.slice(at,end) as Extract<Row,{type:'tool'}>[]:null;
   if(run){
    const runKey=`run:${run[0].id}`;let head=elements.get(runKey);if(!head){head=buildRun(runKey);elements.set(runKey,head);}
    updateRun(head,runKey,run);place(runKey,head);
    for(const tool of run){const key=keyOf(tool);let node=elements.get(key);if(!node){node=build(tool);elements.set(key,node);}update(node,tool);node.hidden=!runOpen.has(runKey);node.classList.add('in-run');place(key,node);}
    at=end;continue;
   }
   const key=keyOf(row);let node=elements.get(key);if(!node){node=build(row);elements.set(key,node);}
   update(node,row);if(row.type==='tool'){node.hidden=false;node.classList.remove('in-run');}place(key,node);at++;
  }
  for(const [key,node] of elements)if(!seen.has(key)){node.remove();elements.delete(key);}
  empty.hidden=seen.size>0;
  paintActivity();
  if(stick)scroll.scrollTop=scroll.scrollHeight;
 }
 // The line under the transcript while Claude works: what it is doing right now, and for how long.
 const activity=el('div','chat-activity');activity.hidden=true;activity.setAttribute('role','status');activity.setAttribute('aria-live','polite');
 const spinner=el('span','chat-spinner'),activityLabel=el('span','chat-activity-label'),activityClock=el('span','chat-activity-clock');
 activity.append(spinner,activityLabel,activityClock);rowsHost.after(activity);
 let turnStartedAt=0,clock:ReturnType<typeof setInterval>|undefined;
 const VERBS:Record<string,string>={Read:'Reading',Edit:'Editing',MultiEdit:'Editing',Write:'Writing',NotebookEdit:'Editing',Bash:'Running',Grep:'Searching',Glob:'Searching',WebFetch:'Fetching',WebSearch:'Searching the web',Task:'Running agent',TodoWrite:'Planning'};
 function activityText(){
  const last=[...rows].reverse().find(row=>row.type!=='status'&&row.type!=='title'&&row.type!=='turn'&&row.type!=='permission-done');
  if(permissions.size)return 'Waiting for your approval';
  const running=[...rows].reverse().find(row=>row.type==='tool'&&row.status==='running');
  if(running&&running.type==='tool'){const verb=VERBS[running.name];const detail=toolSummary(running.name,running.input);return verb?`${verb}${detail?` ${detail}`:''}`:`Using ${running.name}`;}
  if(last?.type==='thinking')return 'Thinking';
  if(last?.type==='text'&&!last.final)return 'Writing';
  return 'Working';
 }
 function paintClock(){const seconds=Math.max(0,Math.round((Date.now()-turnStartedAt)/1000));activityClock.textContent=seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;}
 function paintActivity(){
  const on=working();activity.hidden=!on;
  if(!on){if(clock){clearInterval(clock);clock=undefined;}return;}
  if(!turnStartedAt)turnStartedAt=Date.now();
  const text=activityText();if(activityLabel.textContent!==text)activityLabel.textContent=text;
  paintClock();if(!clock)clock=setInterval(paintClock,1000);
 }
 let frame=0;const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});};

 function apply(event:ChatEvent){
  foldChatEvent(rows,event);
  if(event.type==='status'){
   if(event.state==='working'&&state!=='working')turnStartedAt=Date.now();
   if(event.state==='working')finished=false;else if(state==='working'&&event.state==='idle')finished=!(document.hasFocus()&&host.contains(document.activeElement));
   state=event.state;
   if(event.sessionId)id=event.sessionId;
   if(event.state==='idle'){askContext();void loadLimits();}
   if(event.state==='idle'&&queue.length&&ready){const next=queue.shift()!;renderQueue();send({type:'send',text:next.text,...(next.images.length?{images:next.images}:{})});state='working';}
   else if(event.state==='error'&&queue.length){queue.length=0;renderQueue();}
   if(event.permissionMode){modeSelect.value=event.permissionMode;modeSelect.dispatchEvent(new Event('sync'));}
   const shown=event.model?[...modelSelect.options].find(option=>option.value===event.model||option.dataset.resolved===event.model):undefined;
   if(shown){modelSelect.value=shown.value;modelSelect.dispatchEvent(new Event('sync'));}
   if(event.effort!==undefined||event.ultracode!==undefined)modelSelect.dispatchEvent(new CustomEvent('restore-effort',{detail:{effort:event.effort||'',ultracode:event.ultracode}}));
   showNotice(event.state==='error'?event.message||'Claude could not finish this turn.':'');
   onState({state,sessionId:id,blocked:permissions.size>0,completed:finished});
  }else if(event.type==='permission'||event.type==='permission-done'){
   if(event.type==='permission')permissions.add(event.id);else permissions.delete(event.id);
   onState({state,sessionId:id,blocked:permissions.size>0,completed:finished});
  }else if(event.type==='limit'){
   const next={usedPercent:event.usedPercent,resetsAt:event.resetsAt?new Date(event.resetsAt).toISOString():null};
   liveQuota=event.window==='five_hour'?{...liveQuota,fiveHour:next}:{...liveQuota,weekly:next};paintLimits(liveQuota);
  }else if(event.type==='title'){
   /* The tab keeps the name derived from the first prompt; Claude's own summaries would make it drift. */
  }else if(event.type==='resume-cost'){
   showResume(event);
  }else if(event.type==='user'){
   hideResume();hasTurn=true;
   if(!titled){titled=true;onState({state,sessionId:id,title:chatTitle(event.text)});}
  }
  syncControls();schedule();
 }

 function connect(){
  if(destroyed)return;
  const scheme=location.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(`${scheme}//${location.host}/api/chat`,['ai-web-chat',`token.${token}`]);socket=ws;
  ws.addEventListener('open',()=>send({type:'start',project:project.id,...(id?{sessionId:id}:{}),...(hasTurn?{resume:true}:{}),...(!id&&!hasTurn&&startMode?{permissionMode:startMode}:{})}));
  ws.addEventListener('message',event=>{
   let message:ChatServerMessage;try{message=JSON.parse(event.data) as ChatServerMessage;}catch{return;}
   if(message.type==='ready'){
    ready=true;retries=0;id=message.sessionId;rows.length=0;permissions.clear();
    for(const old of message.replay)foldChatEvent(rows,old);
    const last=[...rows].reverse().find(row=>row.type==='status');state=last?.type==='status'?last.state:'idle';
    if(rows.some(row=>row.type==='user'))hasTurn=true,titled=true;
    showNotice(state==='error'&&last?.type==='status'?last.message||'':'');
    send({type:'list-models'});send({type:'list-commands'});askContext();void loadLimits();syncControls();render();live=true;scroll.scrollTop=scroll.scrollHeight;const first=rows.find(row=>row.type==='user');onState({state,sessionId:id,...(first?.type==='user'&&first.text.trim()?{title:chatTitle(first.text)}:{})});
   }else if(message.type==='event')apply(message.event);
   else if(message.type==='commands')commands=message.commands;
   else if(message.type==='models'&&message.models.length){
    const keep=modelSelect.value;modelSelect.replaceChildren();
    for(const model of message.models){const option=el('option','',model.displayName||model.value);option.value=model.value;if(model.efforts?.length)option.dataset.efforts=model.efforts.join(',');if(model.resolved)option.dataset.resolved=model.resolved;if(model.description)option.title=model.description;modelSelect.append(option);}
    if(keep&&modelSelect.querySelector(`option[value="${CSS.escape(keep)}"]`))modelSelect.value=keep;modelSelect.dispatchEvent(new Event('sync'));
   }else if(message.type==='context')paintRing(message.usage);
   else if(message.type==='forked')onFork?.(message.sessionId);
   else if(message.type==='error'){showNotice(message.message);if(message.code==='PROJECT_NOT_FOUND')destroyed=true;}
  });
  ws.addEventListener('close',()=>{
   if(socket!==ws)return;ready=false;syncControls();
   if(destroyed)return;
   if(retries>=MAX_RETRIES){showNotice('Disconnected from the chat. Reopen it from the tab bar to continue.');return;}
   retries++;retryTimer=setTimeout(connect,Math.min(4000,400*2**retries));
  });
 }

 function submit(){
  const text=input.value.trim();
  if(working()&&!text&&!attachments.length){send({type:'interrupt'});return;}
  if(!ready||!text&&!attachments.length)return;
  if(working()){queue.push({text,images:[...attachments]});input.value='';attachments.length=0;renderAttachments();closeSuggest();autosize();renderQueue();syncControls();saveDraft();return;}
  send({type:'send',text,...(attachments.length?{images:[...attachments]}:{})});input.value='';attachments.length=0;renderAttachments();closeSuggest();autosize();state='working';syncControls();saveDraft();
 }
 function autosize(){input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,220)}px`;}
 form.addEventListener('submit',event=>{event.preventDefault();submit();});
 input.addEventListener('input',()=>{autosize();syncControls();updateSuggest();});
 input.addEventListener('click',updateSuggest);input.addEventListener('blur',()=>setTimeout(closeSuggest,120));
 input.addEventListener('keydown',event=>{
  if(suggestKey(event))return;
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!working())submit();}
  else if(event.key==='Escape'&&working()){event.preventDefault();send({type:'interrupt'});}
 });
 modeSelect.addEventListener('change',()=>{try{localStorage.setItem(MODE_KEY,modeSelect.value);}catch{/* Remembering the mode is optional. */}send({type:'set-permission-mode',mode:modeSelect.value as ChatPermissionMode});});
 modelSelect.addEventListener('change',()=>{send({type:'set-model',model:modelSelect.value});});

 // Messages typed while Claude works wait here and go out in order.
 const queueHost=el('div','chat-queue');queueHost.hidden=true;form.prepend(queueHost);
 function renderQueue(){
  queueHost.hidden=!queue.length;queueHost.replaceChildren();
  queue.forEach((item,index)=>{
   const card=el('div','chat-queued'),text=el('span','chat-queued-text',item.text||`[${item.images.length} image${item.images.length>1?'s':''}]`),remove=el('button','chat-queued-remove');
   remove.type='button';remove.setAttribute('aria-label','Remove queued message');remove.title='Remove';remove.append(icon('close'));remove.onclick=()=>{queue.splice(index,1);renderQueue();};
   card.append(el('span','chat-queued-label','Queued'),text,remove);queueHost.append(card);
  });
 }
 // The composer text survives closing and reopening the app.
 const draftKey=sessionId?`ai-web.chat-draft.${project.id}.${sessionId}`:'';
 function saveDraft(){if(!draftKey)return;try{if(input.value)localStorage.setItem(draftKey,input.value);else localStorage.removeItem(draftKey);}catch{/* Drafts are optional. */}}
 try{const saved=draftKey?localStorage.getItem(draftKey):'';if(saved){input.value=saved;}}catch{/* Drafts are optional. */}
 input.addEventListener('input',saveDraft);
 // A floating button returns to the newest message after scrolling up.
 const jump=el('button','chat-jump');jump.type='button';jump.hidden=true;jump.title='Jump to latest';jump.setAttribute('aria-label','Jump to latest message');jump.append(icon('arrow-down'));
 jump.onclick=()=>{scroll.scrollTo({top:scroll.scrollHeight,behavior:'smooth'});};host.querySelector('.chat-dock')!.before(jump);
 scroll.addEventListener('scroll',()=>{jump.hidden=nearBottom();},{passive:true});
 // Pasted images travel with the next message.
 const attachmentsHost=form.querySelector<HTMLElement>('.chat-attachments')!;
 function renderAttachments(){
  attachmentsHost.hidden=!attachments.length;attachmentsHost.replaceChildren();
  attachments.forEach((image,index)=>{
   const item=el('div','chat-attachment'),thumb=document.createElement('img');thumb.alt='Pasted image';thumb.src=`data:${image.mediaType};base64,${image.data}`;
   const remove=el('button','chat-attachment-remove');remove.type='button';remove.setAttribute('aria-label','Remove image');remove.append(icon('close'));remove.onclick=()=>{attachments.splice(index,1);renderAttachments();syncControls();};
   item.append(thumb,remove);attachmentsHost.append(item);
  });
 }
 const IMAGE_TYPES=['image/png','image/jpeg','image/gif','image/webp'];
 function addImages(list:File[]){
  const files=list.filter(file=>IMAGE_TYPES.includes(file.type));
  for(const file of files){
   if(attachments.length>=4){showNotice('Up to 4 images per message.');break;}
   if(file.size>5*1024*1024){showNotice('Images must be 5 MB or smaller.');continue;}
   const reader=new FileReader();
   reader.onload=()=>{const url=String(reader.result),at=url.indexOf(',');if(at>0&&attachments.length<4){attachments.push({mediaType:file.type as ChatImage['mediaType'],data:url.slice(at+1)});renderAttachments();syncControls();}};
   reader.readAsDataURL(file);
  }
  return files.length>0;
 }
 input.addEventListener('paste',event=>{if(addImages([...(event.clipboardData?.files||[])]))event.preventDefault();});
 const picker=document.createElement('input');picker.type='file';picker.accept=IMAGE_TYPES.join(',');picker.multiple=true;picker.hidden=true;
 picker.onchange=()=>{addImages([...(picker.files||[])]);picker.value='';input.focus();};form.append(picker);

 // "/" at the start offers Claude's commands; "@" offers files from the workspace.
 const suggestHost=form.querySelector<HTMLElement>('.chat-suggest')!;
 let suggestTitle='',suggestItems:{label:string;hint?:string;detail:string;insert:string;from:number;to:number;run?:()=>void}[]=[],suggestIndex=0,fileSeq=0,fileTimer:ReturnType<typeof setTimeout>|undefined;
 function closeSuggest(){suggestItems=[];suggestHost.hidden=true;suggestHost.replaceChildren();}
 function showSuggest(items:typeof suggestItems){
  suggestItems=items;suggestIndex=0;
  if(!items.length){closeSuggest();return;}
  suggestHost.hidden=false;suggestHost.replaceChildren(el('div','chat-suggest-title',suggestTitle));
  items.forEach((item,index)=>{
   const option=el('div','chat-suggest-item');option.setAttribute('role','option');option.dataset.active=String(index===suggestIndex);
   const head=el('span','chat-suggest-head');head.append(el('span','chat-suggest-label',item.label));if(item.hint)head.append(el('span','chat-suggest-hint',item.hint));option.append(head,el('span','chat-suggest-detail',item.detail));
   option.onmousedown=event=>{event.preventDefault();choose(index);};suggestHost.append(option);
  });
 }
 function highlight(next:number){suggestIndex=(next+suggestItems.length)%suggestItems.length;const nodes=[...suggestHost.querySelectorAll<HTMLElement>('.chat-suggest-item')];nodes.forEach((node,index)=>{node.dataset.active=String(index===suggestIndex);});nodes[suggestIndex]?.scrollIntoView({block:'nearest'});}
 function choose(index:number){
  const item=suggestItems[index];if(!item)return;
  if(item.run){input.value='';closeSuggest();autosize();syncControls();item.run();return;}
  input.value=input.value.slice(0,item.from)+item.insert+input.value.slice(item.to);
  const caret=item.from+item.insert.length;input.setSelectionRange(caret,caret);closeSuggest();autosize();syncControls();input.focus();
 }
 function suggestKey(event:KeyboardEvent){
  if(suggestHost.hidden||!suggestItems.length||event.isComposing)return false;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();highlight(suggestIndex+(event.key==='ArrowDown'?1:-1));return true;}
  if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();choose(suggestIndex);return true;}
  if(event.key==='Escape'){event.preventDefault();closeSuggest();return true;}
  return false;
 }
 function updateSuggest(){
  const caret=input.selectionStart??input.value.length,before=input.value.slice(0,caret);
  const command=/^\/([^\s/]*)$/.exec(before);
  if(command){
   const query=command[1].toLowerCase();suggestTitle='Commands';
   const own:{name:string;description:string;argumentHint?:string;run?:()=>void}[]=[
    {name:'plan',description:'Switch to Plan mode',run:()=>{modeSelect.value='plan';modeSelect.dispatchEvent(new Event('change'));input.focus();}},
    {name:'model',description:'Choose the model',run:()=>host.querySelector<HTMLButtonElement>('.chat-trigger[aria-label=Model]')?.click()},
   ];
   const listed=[...own,...commands.filter(item=>!own.some(entry=>entry.name===item.name))];
   showSuggest(listed.filter(item=>item.name.toLowerCase().includes(query)).sort((a,b)=>Number(b.name.toLowerCase().startsWith(query))-Number(a.name.toLowerCase().startsWith(query))).slice(0,8).map(item=>({label:`/${item.name}`,hint:item.argumentHint,detail:item.description||'Run this command',insert:`/${item.name} `,from:0,to:caret,run:(item as {run?:()=>void}).run})));
   return;
  }
  const mention=/(?:^|\s)@([^\s@]*)$/.exec(before);
  if(mention){
   const query=mention[1],from=caret-query.length-1,seq=++fileSeq;suggestTitle='Files';clearTimeout(fileTimer);
   fileTimer=setTimeout(async()=>{
    try{
     const response=await fetch(`/api/file-search?${new URLSearchParams({project:project.id,q:query})}`,{headers:{'X-AI-Web-Token':token}});
     if(!response.ok||seq!==fileSeq)return;
     const data=await response.json() as {files:{name:string;path:string}[]};
     if(seq!==fileSeq||document.activeElement!==input)return;
     showSuggest(data.files.slice(0,8).map(file=>({label:file.name,detail:file.path,insert:`@${file.path} `,from,to:caret})));
    }catch{/* Suggestions are optional. */}
   },query?100:0);
   return;
  }
  fileSeq++;closeSuggest();
 }
 // Looking at a finished chat clears its "needs attention" mark.
 function acknowledge(){if(!finished)return;finished=false;onState({state,sessionId:id,blocked:permissions.size>0,completed:false});}
 host.addEventListener('pointerdown',()=>{acknowledge();onFocus();});host.addEventListener('focusin',acknowledge);
 syncControls();connect();

 return {
  focus:()=>{acknowledge();input.focus();},
  sessionId:()=>id,
  /** Ends the server-side session as well as the view; used when the tab is closed. */
  close(){send({type:'close'});this.destroy();},
  destroy(){destroyed=true;clearInterval(limitClock);clearTimeout(retryTimer);if(clock)clearInterval(clock);for(const reveal of reveals.values())if(reveal.frame)cancelAnimationFrame(reveal.frame);if(frame)cancelAnimationFrame(frame);const ws=socket;socket=null;ws?.close(1000);host.replaceChildren();},
 };
}
