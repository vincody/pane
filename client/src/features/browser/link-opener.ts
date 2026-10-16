import type {Workspace} from '../../../../shared/contracts.ts';
import type {LinkPreferenceStore} from './link-preferences.ts';
interface Options {
 preferences:LinkPreferenceStore;
 available:()=>boolean;
 openInApp:(url:string,project?:Workspace)=>void;
 openExternal:(url:string)=>void;
}
type Choice='app'|'system';
const MAX_CARDS=3,CARD_LIFETIME_MS=30_000;
export function webLink(value:string){
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
/** Sends web links to the Browser tab or the system browser, asking first unless a choice was remembered. */
export function createLinkOpener({preferences,available,openInApp,openExternal}:Options){
 let dialog:HTMLDialogElement|undefined,stack:HTMLElement|undefined,asking=false;
 const go=(choice:Choice,url:string,project?:Workspace)=>{if(choice==='app')openInApp(url,project);else openExternal(url);};
 function choose(url:string){
  dialog??=build();
  const element=dialog,label=element.querySelector<HTMLElement>('.link-choice-url')!,remember=element.querySelector<HTMLInputElement>('input')!;
  label.textContent=url;label.title=url;remember.checked=false;
  return new Promise<{choice:Choice;remember:boolean}|null>(resolve=>{
   element.addEventListener('close',()=>{const value=element.returnValue;resolve(value==='app'||value==='system'?{choice:value,remember:remember.checked}:null);},{once:true});
   element.returnValue='';element.showModal();
  });
 }
 function build(){
  const element=document.createElement('dialog');element.id='link-choice';element.setAttribute('aria-labelledby','link-choice-title');
  element.innerHTML='<form method="dialog"><h2 id="link-choice-title">Open this link</h2><p class="link-choice-url"></p><div class="link-choice-actions"><button type="submit" value="app" class="link-choice-primary" autofocus>Open in Pane</button><button type="submit" value="system">Open in system browser</button></div><label class="link-choice-remember"><input type="checkbox"> Remember my choice</label><button type="submit" value="cancel" class="link-choice-cancel">Cancel</button></form>';
  document.body.append(element);return element;
 }
 async function open(raw:string,project?:Workspace){
  const url=webLink(raw);if(!url)return;
  if(!available()){openExternal(url);return;}
  const mode=preferences.get().open;
  if(mode!=='ask'){go(mode,url,project);return;}
  if(asking)return;
  asking=true;
  try{
   const answer=await choose(url);if(!answer)return;
   if(answer.remember)preferences.set({open:answer.choice});
   go(answer.choice,url,project);
  }finally{asking=false;}
 }
 function announce(raw:string,project?:Workspace){
  const url=webLink(raw);if(!url||!available())return;
  stack??=(()=>{const element=document.createElement('aside');element.id='link-prompts';element.setAttribute('aria-label','Local servers');element.setAttribute('role','status');document.body.append(element);return element;})();
  if([...stack.children].some(card=>(card as HTMLElement).dataset.url===url))return;
  while(stack.children.length>=MAX_CARDS)stack.firstElementChild?.remove();
  const mode=preferences.get().open,address=new URL(url).host,card=document.createElement('section');card.className='link-prompt';card.dataset.url=url;
  const copy=document.createElement('div');copy.className='link-prompt-copy';const title=document.createElement('strong'),detail=document.createElement('span');title.textContent='Local server detected';detail.textContent=address;detail.title=url;copy.append(title,detail);
  const actions=document.createElement('div');actions.className='link-prompt-actions';
  const dismiss=()=>{clearTimeout(timer);card.remove();};
  for(const choice of mode==='ask'?(['app','system'] as const):[mode]){
   const button=document.createElement('button');button.type='button';button.textContent=choice==='app'?'Open in Pane':'Open in browser';button.setAttribute('aria-label',`${choice==='app'?'Open in Pane':'Open in system browser'}: ${address}`);
   button.onclick=()=>{dismiss();go(choice,url,project);};actions.append(button);
  }
  const close=document.createElement('button');close.type='button';close.className='link-prompt-dismiss';close.setAttribute('aria-label','Dismiss');close.textContent='×';close.onclick=dismiss;
  card.append(copy,actions,close);stack.append(card);
  const timer=setTimeout(dismiss,CARD_LIFETIME_MS);
 }
 return {open,announce,get enabled(){return available();}};
}
export type LinkOpener=ReturnType<typeof createLinkOpener>;
