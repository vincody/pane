import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {Unicode11Addon} from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import type {TerminalClientMessage,TerminalServerMessage,Workspace} from '../../../../shared/contracts.ts';
import type {NativeIcon} from '../../components/contracts.ts';
import {readTerminalFontSize} from './terminal-font.ts';
import {terminalTheme} from './terminal-view.ts';
import {readDockPosition,type DockPosition} from '../chat/chat-settings.ts';

interface DockSession {id:string;project:string;name:string;element:HTMLElement;terminal:Terminal;fit:FitAddon;socket:WebSocket|null;ready:boolean;exited:boolean;attached:boolean;retries:number;timer?:ReturnType<typeof setTimeout>}
interface Options {token:string;icon:NativeIcon;onChange?:(open:boolean)=>void}
const KEY='ai-web.terminal-dock',WIDTH_KEY='ai-web.terminal-dock-width',HEIGHT_KEY='ai-web.terminal-dock-height',MIN=260,MAX=720;
interface Saved {open:boolean;sessions:{id:string;project:string;name:string}[]}
const read=():Saved=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'null') as Saved|null;if(value&&Array.isArray(value.sessions))return {open:Boolean(value.open),sessions:value.sessions.filter(item=>typeof item?.id==='string'&&typeof item.project==='string').slice(0,20)};}catch{}return {open:false,sessions:[]};};

/**
 * A plain-shell terminal on the right of the window, like Claude desktop's. It is hidden until asked for, keeps one set of
 * tabs per workspace, and keeps its shells alive on the server so a reloaded window reattaches to them.
 */
export function setupTerminalDock({token,icon,onChange}:Options){
 const app=document.querySelector<HTMLElement>('#app')!;
 const dock=document.createElement('aside');dock.id='terminal-dock';dock.hidden=true;dock.setAttribute('aria-label','Terminal');
 dock.innerHTML='<div class="dock-resizer" role="separator" aria-orientation="vertical" aria-label="Resize terminal" tabindex="0"></div><header class="dock-head"><div class="dock-tabs" role="tablist" aria-label="Terminals"></div><button type="button" class="dock-button" data-action="new" aria-label="New terminal" title="New terminal"></button><span class="dock-spacer"></span><button type="button" class="dock-button" data-action="maximize" aria-label="Maximize terminal" aria-pressed="false" title="Maximize terminal"></button><button type="button" class="dock-button" data-action="close" aria-label="Hide terminal" title="Hide terminal (Ctrl+`)"></button></header><div class="dock-screens"></div><div class="dock-empty">No terminal for this workspace yet.</div>';

 const tabs=dock.querySelector<HTMLElement>('.dock-tabs')!,screens=dock.querySelector<HTMLElement>('.dock-screens')!,emptyNote=dock.querySelector<HTMLElement>('.dock-empty')!;
 dock.querySelector<HTMLElement>('[data-action=new]')!.append(icon('plus'));dock.querySelector<HTMLElement>('[data-action=close]')!.append(icon('close'));
 const maxButton=dock.querySelector<HTMLButtonElement>('[data-action=maximize]')!;
 const setMaximized=(next:boolean)=>{const was=dock.classList.contains('maximized');dock.classList.toggle('maximized',next);
  /* Maximized, the dock covers the main area only, so it moves inside <main> below the top bar; restoring puts it back. */
  if(next){const main=document.querySelector<HTMLElement>('main')!,work=document.querySelector<HTMLElement>('#workspace');main.append(dock);dock.style.setProperty('--dock-top',`${work?Math.round(work.getBoundingClientRect().top-main.getBoundingClientRect().top):0}px`);}
  else if(was)document.dispatchEvent(new CustomEvent('dock-position',{detail:readDockPosition()}));
  maxButton.setAttribute('aria-pressed',String(next));maxButton.setAttribute('aria-label',next?'Restore terminal':'Maximize terminal');maxButton.title=next?'Restore terminal':'Maximize terminal';maxButton.replaceChildren(icon(next?'minimize':'maximize'));};
 setMaximized(false);maxButton.onclick=()=>setMaximized(!dock.classList.contains('maximized'));

 const sessions:DockSession[]=[];
 let project:Workspace|null=null,active:DockSession|null=null,open=false;
 const saved=read();
 const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify({open,sessions:sessions.filter(item=>!item.exited).map(({id,project,name})=>({id,project,name}))} satisfies Saved));}catch{}};
 const shown=()=>sessions.filter(item=>item.project===project?.id);
 const send=(session:DockSession,message:TerminalClientMessage)=>{if(session.socket?.readyState===WebSocket.OPEN)session.socket.send(JSON.stringify(message));};
 const fit=(session:DockSession)=>{if(!open||session.element.hidden||!session.element.isConnected)return;try{session.fit.fit();if(session.ready)send(session,{type:'resize',cols:session.terminal.cols,rows:session.terminal.rows});}catch{/* No measurable size yet. */}};

 function connect(session:DockSession){
  if(session.exited)return;
  const scheme=location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(`${scheme}//${location.host}/api/terminal`,['ai-web-terminal',`token.${token}`]);session.socket=socket;
  socket.addEventListener('open',()=>{
   try{session.fit.fit();}catch{}
   const size={cols:Math.max(2,session.terminal.cols),rows:Math.max(2,session.terminal.rows)};
   send(session,session.attached?{type:'attach',sessionId:session.id,...size}:{type:'start',project:session.project,sessionId:session.id,detachable:true,...size});
  });
  socket.addEventListener('message',event=>{
   let message:TerminalServerMessage;try{message=JSON.parse(event.data) as TerminalServerMessage;}catch{return;}
   if(message.type==='ready'){session.ready=true;session.retries=0;session.attached=true;fit(session);}
   else if(message.type==='data'){if(message.replay)session.terminal.reset();session.terminal.write(message.data);}
   else if(message.type==='exit'){session.exited=true;session.terminal.write(`\r\n\x1b[2m[process exited with code ${message.exitCode}]\x1b[0m\r\n`);persist();render();}
   else if(message.type==='error'){
    // A shell the server no longer has (for example after Pane restarted) is dropped instead of retried.
    if(message.code==='SESSION_NOT_FOUND'){session.attached=false;session.exited=true;remove(session,false);}
    else session.terminal.write(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`);
   }
  });
  socket.addEventListener('close',()=>{
   if(session.socket!==socket)return;session.ready=false;
   if(session.exited||!sessions.includes(session))return;
   if(session.retries>=5)return;session.retries++;session.timer=setTimeout(()=>connect(session),Math.min(4000,400*2**session.retries));
  });
 }

 function create(target:Workspace,id:string=crypto.randomUUID(),attached=false,name=''){
  const element=document.createElement('div');element.className='dock-screen';element.hidden=true;screens.append(element);
  const terminal=new Terminal({fontFamily:'"JetBrains Mono", Consolas, monospace',fontSize:readTerminalFontSize(),lineHeight:1.2,cursorBlink:true,scrollback:5000,allowProposedApi:true,minimumContrastRatio:4.5,theme:terminalTheme()});
  const fitAddon=new FitAddon();terminal.loadAddon(fitAddon);terminal.loadAddon(new Unicode11Addon());terminal.unicode.activeVersion='11';terminal.open(element);
  const number=sessions.filter(item=>item.project===target.id).length+1;
  const session:DockSession={id,project:target.id,name:name||`Terminal ${number}`,element,terminal,fit:fitAddon,socket:null,ready:false,exited:false,attached,retries:0};
  sessions.push(session);persist();
  terminal.onData(data=>{if(session.exited){if(data==='\r')reopen(session);return;}send(session,{type:'input',data});});
  // Copy keeps Ctrl+C for interrupting when nothing is selected; paste goes through the clipboard.
  terminal.attachCustomKeyEventHandler(event=>{
   if(event.type!=='keydown')return true;
   const mod=event.ctrlKey||event.metaKey;
   if(mod&&event.key.toLowerCase()==='c'&&terminal.hasSelection()&&(event.shiftKey||event.key==='c')){void navigator.clipboard.writeText(terminal.getSelection()).catch(()=>{});return false;}
   if(mod&&event.shiftKey&&event.key.toLowerCase()==='v'){event.preventDefault();void navigator.clipboard.readText().then(text=>terminal.paste(text)).catch(()=>{});return false;}
   return true;
  });
  new ResizeObserver(()=>fit(session)).observe(element);
  connect(session);return session;
 }
 /** A finished shell is replaced by a fresh one in the same tab when Enter is pressed. */
 function reopen(session:DockSession){
  const target=project;if(!target||session.project!==target.id)return;
  const index=sessions.indexOf(session);remove(session,true);
  const fresh=create(target,undefined,false,session.name);sessions.splice(sessions.indexOf(fresh),1);sessions.splice(Math.min(index,sessions.length),0,fresh);select(fresh);
 }
 function remove(session:DockSession,kill:boolean){
  const index=sessions.indexOf(session);if(index<0)return;
  clearTimeout(session.timer);if(kill)send(session,{type:'close'});
  const socket=session.socket;session.socket=null;socket?.close(1000);
  session.terminal.dispose();session.element.remove();sessions.splice(index,1);
  if(active===session)active=null;
  // Closing the last terminal of the workspace closes the panel with it.
  if(open&&!shown().length){setOpen(false);return;}
  render();persist();
 }
 function select(session:DockSession|null){
  active=session&&shown().includes(session)?session:shown().at(-1)||null;
  render();
  if(active&&open)requestAnimationFrame(()=>{fit(active!);active!.terminal.focus();});
 }
 function render(){
  const list=shown();if(!active||!list.includes(active))active=list.at(-1)||null;
  for(const item of sessions)item.element.hidden=item!==active;
  tabs.replaceChildren();
  for(const item of list){
   const tab=document.createElement('div');tab.className='dock-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(item===active));tab.tabIndex=0;
   const label=document.createElement('span');label.className='dock-tab-label';label.textContent=item.name;tab.title=item.name;
   const close=document.createElement('button');close.type='button';close.className='dock-tab-close';close.setAttribute('aria-label',`Close ${item.name}`);close.append(icon('close'));
   close.onclick=event=>{event.stopPropagation();remove(item,true);};
   tab.append(label,close);tab.onclick=()=>select(item);tab.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(item);}};
   tabs.append(tab);
  }
  emptyNote.hidden=list.length>0;
  tabs.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  fades();
 }
 // Edge fades tell which side still holds hidden tabs; the wheel scrolls the row sideways.
 function fades(){tabs.dataset.fadeStart=String(tabs.scrollLeft>1);tabs.dataset.fadeEnd=String(tabs.scrollLeft+tabs.clientWidth<tabs.scrollWidth-1);}
 tabs.addEventListener('scroll',fades,{passive:true});
 tabs.addEventListener('wheel',event=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX)&&tabs.scrollWidth>tabs.clientWidth){tabs.scrollLeft+=event.deltaY;event.preventDefault();}},{passive:false});
 new ResizeObserver(fades).observe(tabs);
 function setOpen(next:boolean){
  open=next;dock.hidden=!next;if(!next)setMaximized(false);app.classList.toggle('terminal-dock-open',next);
  persist();onChange?.(next);
  if(next){
   if(project&&!shown().length)select(create(project));else select(active);
  }
 }
 dock.querySelector<HTMLElement>('[data-action=new]')!.onclick=()=>{if(!project)return;const before=sessions.length;if(!open)setOpen(true);if(sessions.length===before)select(create(project));};
 dock.querySelector<HTMLElement>('[data-action=close]')!.onclick=()=>setOpen(false);
 new MutationObserver(()=>{for(const item of sessions)item.terminal.options.theme=terminalTheme();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

 // Width: drag the left edge, arrow keys to adjust, double-click to reset.
 const resizer=dock.querySelector<HTMLElement>('.dock-resizer')!;
 const bottom=()=>dock.dataset.position==='bottom';
 const size=()=>{const box=dock.getBoundingClientRect();return bottom()?box.height:box.width;};
 const refit=()=>requestAnimationFrame(()=>{for(const item of sessions)fit(item);});
 const setWidth=(width:number,store=false)=>{
  const key=bottom()?HEIGHT_KEY:WIDTH_KEY;width=bottom()?Math.max(120,Math.min(Math.round(innerHeight*.7),Math.round(width))):Math.max(MIN,Math.min(MAX,Math.round(width)));
  dock.style.setProperty(bottom()?'--dock-height':'--dock-width',`${width}px`);resizer.setAttribute('aria-valuenow',String(width));if(store)try{localStorage.setItem(key,String(width));}catch{}
  refit();
 };
 const placeDock=(position:DockPosition)=>{
  dock.dataset.position=position;
  if(position==='bottom')document.querySelector<HTMLElement>('main')!.append(dock);else document.querySelector<HTMLElement>('#files-sidebar')!.before(dock);
  resizer.setAttribute('aria-orientation',position==='bottom'?'horizontal':'vertical');
  dock.style.removeProperty('--dock-width');dock.style.removeProperty('--dock-height');
  try{const stored=Number(localStorage.getItem(position==='bottom'?HEIGHT_KEY:WIDTH_KEY));if(stored>=(position==='bottom'?120:MIN))setWidth(stored);}catch{}
  refit();
 };
 placeDock(readDockPosition());
 document.addEventListener('dock-position',event=>placeDock((event as CustomEvent<DockPosition>).detail));
 let drag:{x:number;size:number}|null=null;
 resizer.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag={x:bottom()?event.clientY:event.clientX,size:size()};resizer.setPointerCapture(event.pointerId);app.classList.add('resizing-panels');});
 resizer.addEventListener('pointermove',event=>{if(drag)setWidth(drag.size+(drag.x-(bottom()?event.clientY:event.clientX)));});
 const finish=()=>{if(!drag)return;drag=null;app.classList.remove('resizing-panels');setWidth(size(),true);};
 resizer.addEventListener('pointerup',finish);resizer.addEventListener('pointercancel',finish);
 resizer.addEventListener('dblclick',()=>{dock.style.removeProperty(bottom()?'--dock-height':'--dock-width');try{localStorage.removeItem(bottom()?HEIGHT_KEY:WIDTH_KEY);}catch{}refit();});
 resizer.addEventListener('keydown',event=>{const grow=bottom()?'ArrowUp':'ArrowLeft',shrink=bottom()?'ArrowDown':'ArrowRight';if(![grow,shrink].includes(event.key))return;event.preventDefault();setWidth(size()+(event.key===grow?1:-1)*(event.shiftKey?40:10),true);});

 return {
  get open(){return open;},
  toggle:()=>setOpen(!open),
  show:()=>{if(!open)setOpen(true);},
  /** Opens the dock with a new shell, used when something asks for "a terminal". */
  openNew(target:Workspace){project=target;const before=sessions.length;if(!open)setOpen(true);if(sessions.length===before)select(create(target));},
  /** Switching workspace shows that workspace's own shells. */
  setProject(next:Workspace|null){project=next;active=null;render();if(open&&next&&!shown().length)select(create(next));else select(active);},
  /** Reattaches shells that were running before a reload; call once the workspaces are known. */
  restore(projects:Workspace[],current:Workspace|null){
   project=current;
   for(const item of saved.sessions){const target=projects.find(entry=>entry.id===item.project);if(target&&!sessions.some(entry=>entry.id===item.id))create(target,item.id,true,item.name);}
   if(saved.open)setOpen(true);else render();
  },
 };
}
export type TerminalDock=ReturnType<typeof setupTerminalDock>;
