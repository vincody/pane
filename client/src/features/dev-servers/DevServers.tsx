import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import type {Api,Workspace} from '../../components/contracts';
import type {DevServerSnapshot} from '../../../../shared/contracts.ts';
interface Options {api:Api;getProject:()=>Workspace|null;onError:(message:string)=>void}
const iconPaths={server:'M4 3h16v8H4z M4 13h16v8H4z M8 7h.01 M8 17h.01 M12 7h5 M12 17h5',folder:'M3 7V5h6l2 2h10v13H3Z',branch:'M6 6v12 M6 11h6a6 6 0 0 0 6-6 M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2l1 4 M4 12l1 4a8 8 0 0 0 13 2',close:'m6 6 12 12 M18 6 6 18',open:'M4 5h16v14H4z M4 9h16',copy:'M8 8h12v12H8z M16 8V4H4v12h4',check:'m5 12 4 4 10-10'};
function DevIcon({kind}:{kind:keyof typeof iconPaths}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[kind]}/></svg>;}
export function setupDevServers({api,getProject,onError}:Options){
 const footer=document.querySelector('.sidebar-footer')!;
 const trigger=document.createElement('button');trigger.id='dev-servers-open';trigger.type='button';trigger.className='sidebar-tool dev-server-trigger';trigger.title='Dev servers';trigger.setAttribute('aria-label','Dev servers');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','dev-servers-popover');
 trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="8" rx="2"/><rect x="4" y="13" width="16" height="8" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/></svg><span class="dev-server-count">0</span>';
 footer.insertBefore(trigger,document.querySelector('#settings'));
 const panel=document.createElement('section');panel.id='dev-servers-popover';panel.className='dev-server-popover';panel.setAttribute('role','region');panel.setAttribute('aria-label','Workspace dev servers');panel.hidden=true;document.body.append(panel);
 const root=createRoot(panel);let disposed=false,opened=false,generation=0,controller:AbortController|undefined,loading=false,snapshot:DevServerSnapshot={available:false,scannedAt:null,rows:[]},copied:string|null=null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let expiryTimer:ReturnType<typeof setTimeout>|undefined;
 function schedule(){clearTimeout(timer);if(disposed||document.hidden||!getProject())return;timer=setTimeout(()=>void refresh(),opened?3000:15000);}
 function position(){if(!opened)return;const anchor=trigger.getBoundingClientRect(),rect=panel.getBoundingClientRect();panel.style.left=`${Math.max(8,Math.min(anchor.left,window.innerWidth-rect.width-8))}px`;panel.style.top=`${Math.max(8,Math.min(anchor.top-rect.height-8,window.innerHeight-rect.height-8))}px`;}
 function close(restore=true){opened=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');schedule();if(restore)trigger.focus();}
 async function copy(id:string,url:string){try{await navigator.clipboard.writeText(url);if(disposed)return;copied=id;render();}catch{onError('Could not copy the server URL.');}}
 function render(){if(disposed)return;clearTimeout(expiryTimer);const now=Date.now(),project=getProject();
  const rows=snapshot.rows.filter(row=>row.status!=='stopped'||!row.stoppedAt||now-Date.parse(row.stoppedAt)<5000);
  const expiry=rows.filter(row=>row.status==='stopped'&&row.stoppedAt).map(row=>Date.parse(row.stoppedAt!)+5000-now).filter(delay=>Number.isFinite(delay)&&delay>0);
  if(expiry.length)expiryTimer=setTimeout(render,Math.min(...expiry));
  const running=rows.filter(row=>row.status==='running').length;trigger.querySelector('.dev-server-count')!.textContent=String(running);
  const elapsed=snapshot.scannedAt?Math.max(0,Math.floor((Date.now()-Date.parse(snapshot.scannedAt))/1000)):0;
  const scanned=loading?'Scanning…':snapshot.scannedAt?elapsed<10?'Scanned just now':`Scanned ${elapsed<60?`${elapsed}s`:`${Math.floor(elapsed/60)}m`} ago`:'Not scanned';
  flushSync(()=>root.render(<>
   <header className="dev-server-heading"><DevIcon kind="server"/><strong>Dev servers</strong><button type="button" className="icon-button dev-server-refresh" aria-label="Refresh dev servers" title="Refresh" disabled={loading||!project} onClick={()=>void refresh(true)}><DevIcon kind="refresh"/></button><button type="button" className="icon-button" aria-label="Close dev servers" title="Close" onClick={()=>close()}><DevIcon kind="close"/></button></header>
   <div className="dev-server-context"><DevIcon kind="folder"/><span className="dev-server-workspace" title={project?.root}>{project?.name||'No workspace selected'}</span>{project?.branch&&<span className="dev-server-branch" title={project.branch}><DevIcon kind="branch"/>{project.branch}</span>}{project&&<span className="dev-server-scope">This workspace</span>}</div>
   <div className="dev-server-caption">{scanned}<span aria-hidden="true"> · </span>{running} running</div>
   {!project&&<p className="dev-server-empty">Select a workspace to view its servers.</p>}
   {project&&<>
    {!snapshot.available&&<p className="dev-server-empty">{snapshot.error||(loading?'Checking local listeners…':'Scan unavailable')}</p>}
    {snapshot.available&&rows.length===0&&<p className="dev-server-empty">No dev servers detected</p>}
    {rows.length>0&&<ul className="dev-server-list">{rows.map(row=>{
     const address=row.url?new URL(row.url).host:`${row.host.includes(':')?`[${row.host}]`:row.host}:${row.port}`;
     return <li key={row.id} className="dev-server-row" data-status={row.status}>
      <div className="dev-server-identity"><strong title={address}>{address}</strong>{row.url&&<span className="dev-server-url" title={row.url}>{row.url}</span>}<span className="dev-server-process" title={row.name}>{row.protocol==='unknown'?'Protocol unknown':row.protocol.toUpperCase()}<span aria-hidden="true"> · </span>{row.name}</span></div>
      <span className="dev-server-status">{row.status==='running'?'Running':row.status==='stopped'?'Stopped':'Unknown'}</span>
      <div className="dev-server-actions">{row.url&&<>{row.status==='running'&&<a href={row.url} target="_blank" rel="noopener noreferrer" title="Open in browser"><DevIcon kind="open"/>Open</a>}<button type="button" className="dev-server-copy" aria-label={copied===row.id?'Copied':'Copy URL'} title={copied===row.id?'Copied':'Copy URL'} onClick={()=>void copy(row.id,row.url!)}><DevIcon kind={copied===row.id?'check':'copy'}/></button></>}</div>
     </li>;
    })}</ul>}
   </>}
  </>));position();
 }
 async function refresh(force=false){if(disposed||document.hidden||loading&&!force)return;clearTimeout(timer);const project=getProject(),stamp=++generation;controller?.abort();controller=undefined;copied=null;if(!project){snapshot={available:false,scannedAt:null,rows:[]};loading=false;render();return;}const active=new AbortController();controller=active;loading=true;render();try{const result=await api<DevServerSnapshot>(`/api/dev-servers?${new URLSearchParams({project:project.id})}`,{signal:active.signal});if(disposed||stamp!==generation||getProject()?.id!==project.id)return;snapshot=result;}catch(error){if(disposed||stamp!==generation||active.signal.aborted)return;snapshot={available:false,scannedAt:snapshot.scannedAt,rows:snapshot.rows.map(row=>row.status==='stopped'?row:{...row,status:'unknown'}),error:error instanceof Error?error.message:'Scan unavailable'};}finally{if(stamp===generation&&!disposed){loading=false;render();schedule();}}}
 function projectChanged(){generation++;controller?.abort();snapshot={available:false,scannedAt:null,rows:[]};loading=false;copied=null;render();void refresh();}
 trigger.onclick=()=>{if(opened){close();return;}opened=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');render();void refresh(true);};
 const outside=(event:PointerEvent)=>{if(opened&&event.target instanceof Node&&!panel.contains(event.target)&&!trigger.contains(event.target))close();};
 const keydown=(event:KeyboardEvent)=>{if(opened&&event.key==='Escape'){event.preventDefault();close();}};
 const visible=()=>{if(document.hidden){clearTimeout(timer);generation++;controller?.abort();loading=false;}else void refresh(true);};
 const focus=()=>void refresh(true);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visible);window.addEventListener('focus',focus);window.addEventListener('resize',position);
 render();void refresh();
 return {projectChanged,dispose(){disposed=true;generation++;controller?.abort();clearTimeout(timer);clearTimeout(expiryTimer);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',focus);window.removeEventListener('resize',position);root.unmount();panel.remove();trigger.remove();}};
}


