import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {errorMessage,type Api,type Workspace} from '../../components/contracts';
import type {ResourceSnapshot} from '../../../../shared/resources.ts';
import {formatCpu,formatMemory} from './resource-format.ts';
interface Options {api:Api;getProjects:()=>Workspace[];getTerminals:()=>{id:string;name:string}[];onError:(message:string)=>void}
const POLL_MS=3000;
const emptySnapshot=():ResourceSnapshot=>{const usage={memory:0,cpu:null,processes:0};return {available:false,sampledAt:'',host:{totalMemory:0,freeMemory:0},app:{...usage,main:usage,renderer:usage,gpu:usage,other:usage},terminals:[]};};
// Opening the panel is what starts measuring; nothing is sampled while it is closed.
export function setupResources({api,getProjects,getTerminals,onError}:Options){
 const footer=document.querySelector('.sidebar-footer')!;
 const trigger=document.createElement('button');trigger.id='resources-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='Resources';trigger.setAttribute('aria-label','Resources');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
 trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>';
 footer.insertBefore(trigger,document.querySelector('#settings'));
 const panel=document.createElement('section');panel.id='resources-popover';panel.className='resources-popover';panel.setAttribute('role','region');panel.setAttribute('aria-label','Resource usage');panel.hidden=true;document.body.append(panel);
 const root=createRoot(panel);
 let disposed=false,opened=false,loading=false,failed=false,snapshot:ResourceSnapshot=emptySnapshot(),timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,confirming:string|null=null,confirmTimer:ReturnType<typeof setTimeout>|undefined;
 const closing=new Set<string>();
 function position(){if(!opened)return;const anchor=trigger.getBoundingClientRect(),rect=panel.getBoundingClientRect();panel.style.left=`${Math.max(8,Math.min(anchor.left,window.innerWidth-rect.width-8))}px`;panel.style.top=`${Math.max(8,Math.min(anchor.top-rect.height-8,window.innerHeight-rect.height-8))}px`;}
 function close(restore=true){opened=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');clearTimeout(timer);controller?.abort();loading=false;confirming=null;if(restore)trigger.focus();}
 async function requestClose(id:string){
  if(closing.has(id))return;
  if(confirming!==id){confirming=id;clearTimeout(confirmTimer);confirmTimer=setTimeout(()=>{confirming=null;render();},4000);render();return;}
  clearTimeout(confirmTimer);confirming=null;closing.add(id);render();
  try{await api('/api/close-terminal',{method:'POST',body:JSON.stringify({sessionId:id})});}catch(error){onError(errorMessage(error,'Could not close the terminal.'));}finally{closing.delete(id);}
  if(!disposed&&opened)void refresh();
 }
 function render(){
  if(disposed)return;
  const names=new Map(getTerminals().map(item=>[item.id,item])),projects=getProjects(),{app,host,terminals}=snapshot;
  const rows=[...terminals].sort((a,b)=>b.memory-a.memory);
  const used=host.totalMemory?Math.max(0,host.totalMemory-host.freeMemory):0;
  flushSync(()=>root.render(<>
   <header className="resources-heading"><strong>Resources</strong><button type="button" className="icon-button" aria-label="Refresh resources" title="Refresh" disabled={loading} onClick={()=>void refresh()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/></svg></button></header>
   {failed||(!snapshot.available&&snapshot.sampledAt)?<p className="resources-empty">{snapshot.error||'Resource usage is unavailable.'}</p>:!snapshot.sampledAt?<p className="resources-empty">Measuring…</p>:<>
    <div className="resources-summary" aria-label="Pane total"><div><span>Pane</span><strong>{formatMemory(app.memory)}</strong></div><div><span>CPU</span><strong>{formatCpu(app.cpu)}</strong></div>{host.totalMemory>0&&<div><span>System</span><strong>{formatMemory(used)} <small>of {formatMemory(host.totalMemory)}</small></strong></div>}</div>
    <ul className="resources-breakdown" aria-label="Pane processes">{([['Main',app.main],['Renderer',app.renderer],['GPU',app.gpu],['Other',app.other]] as const).filter(([,usage])=>usage.processes>0).map(([label,usage])=><li key={label}><span>{label}</span><span>{formatMemory(usage.memory)}</span><span>{formatCpu(usage.cpu)}</span></li>)}</ul>
    <div className="resources-subheading">Terminals</div>
    {rows.length===0?<p className="resources-empty">No terminals are running.</p>:<ul className="resources-terminals">{rows.map(row=>{
     const info=names.get(row.id),project=projects.find(item=>item.id===row.project),name=info?.name||'Terminal',confirm=confirming===row.id;
     return <li key={row.id} className="resources-terminal">
      <div className="resources-terminal-name"><strong title={name}>{name}</strong><span title={project?.root}>{project?.name||row.project}{row.agent?` · ${row.agent}`:''}{row.ssh?' · SSH':''}</span></div>
      <span className="resources-figure">{formatMemory(row.memory)}</span><span className="resources-figure">{formatCpu(row.cpu)}</span>
      <button type="button" className="resources-close" data-confirming={confirm} disabled={closing.has(row.id)} aria-label={confirm?`Confirm closing ${name}`:`Close ${name}`} title={confirm?'Click again to close this terminal':'Close this terminal'} onClick={()=>void requestClose(row.id)}>{closing.has(row.id)?'Closing…':confirm?'Confirm':'Close'}</button>
     </li>;})}</ul>}
    <p className="resources-note">Memory is each process's working set. Terminal figures cover the shell and what it runs; the terminal view itself is part of Renderer. Closing a terminal ends all of its processes.</p>
   </>}
  </>));position();
 }
 async function refresh(){
  if(disposed||!opened||document.hidden)return;
  clearTimeout(timer);controller?.abort();const active=new AbortController();controller=active;loading=true;
  try{snapshot=await api<ResourceSnapshot>('/api/resources',{signal:active.signal});failed=false;}
  catch{if(active.signal.aborted)return;failed=true;}
  loading=false;render();
  if(opened&&!disposed&&!document.hidden)timer=setTimeout(()=>void refresh(),snapshot.available&&snapshot.app.cpu===null?1200:POLL_MS);
 }
 trigger.onclick=()=>{if(opened){close();return;}opened=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');render();void refresh();};
 const outside=(event:PointerEvent)=>{if(opened&&event.target instanceof Node&&!panel.contains(event.target)&&!trigger.contains(event.target))close();};
 const keydown=(event:KeyboardEvent)=>{if(opened&&event.key==='Escape'){event.preventDefault();close();}};
 const visible=()=>{if(document.hidden){clearTimeout(timer);controller?.abort();loading=false;}else if(opened)void refresh();};
 document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visible);window.addEventListener('resize',position);
 return {dispose(){disposed=true;controller?.abort();clearTimeout(timer);clearTimeout(confirmTimer);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visible);window.removeEventListener('resize',position);root.unmount();panel.remove();trigger.remove();}};
}
