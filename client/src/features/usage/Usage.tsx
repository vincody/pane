import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {miniQuota} from './quota-mini.ts';
import type {Api,Provider,QuotaMode,AccountQuota} from '../../components/contracts';
import type {TokenUsageSnapshot} from '../../../../shared/contracts';
type TokenRange='today'|'7d'|'30d'|'all';
interface Snapshot {enabled:boolean;providers:Provider[];mode:QuotaMode;data:Map<Provider,AccountQuota>;detailsPending:boolean;tokenPending:boolean;tokenRange:TokenRange;tokens:TokenUsageSnapshot|null;tokenError:string}
const ALL_PROVIDERS: readonly Provider[]=['codex','claude'];
const providerName=(provider:Provider)=>provider==='codex'?'Codex':'Claude';
function MiniUsage({state,onOpen}:{state:Snapshot;onOpen:()=>void}){
 return <>{state.providers.map(provider=>{
   const value=state.data.get(provider),label=providerName(provider),{windows,tightest}=miniQuota(value),shown=state.mode==='auto'?(tightest?[tightest]:[]):windows.filter(window=>state.mode==='both'||window.label===state.mode);
   const formatWin=(winLabel:string)=>{
     const w=windows.find(item=>item.label===winLabel);
     const rem=w?.remaining;
     const isNear=Boolean(w&&w.remaining<20);
     return <span key={winLabel} className={isNear?'near-limit':''}>{winLabel} {rem!==undefined?`${rem}%`:'—'}</span>;
   };
   const content=state.mode==='both'?(
     <span className="compact-usage-metric">{formatWin('5h')}<span className="compact-usage-sep">{' · '}</span>{formatWin('7d')}</span>
   ):shown.length?(
     <span className={`compact-usage-metric${shown[0].remaining<20?' near-limit':''}`}>{shown[0].remaining}% · {shown[0].label}</span>
   ):<span className="compact-usage-metric compact-usage-idle">{state.mode==='auto'?'Unavailable':`${state.mode} unavailable`}</span>;
   const details=windows.map(window=>`${window.label}: ${window.remaining}% remaining${window.resetsAt?`; resets ${new Date(window.resetsAt).toLocaleString()}`:''}`);
   const title=[label,...(details.length?details:[value?.message||(!value?'Loading account usage':'Limit unavailable or expired')]),...(value?.stale?['Last known quota; refresh unavailable']:[]),'Open usage details'].join('\n');
   return <button key={provider} type="button" className="compact-usage-line" onClick={onOpen} title={title} aria-label={`${label}: ${details.join('; ')||'Quota unavailable'}. Open usage details`}><span>{label}</span>{content}</button>;
 })}</>;
}
const formatTokens=(value:number)=>value.toLocaleString();
const compactTokens=(value:number)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value);
function TokenNumber({value}:{value:number}){return <span title={`${formatTokens(value)} tokens`} aria-label={`${formatTokens(value)} tokens`}>{compactTokens(value)}</span>;}
function resetIn(value:string){const minutes=Math.max(1,Math.ceil((Date.parse(value)-Date.now())/60000));return minutes>=1440?`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`:minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;}
function UsageDetails({state,onClose,onRefresh,onRange}:{state:Snapshot;onClose:()=>void;onRefresh:()=>void;onRange:(range:TokenRange)=>void}){
 const total=state.tokens?.providers.some(value=>value.supported&&value.available)?state.tokens.providers.reduce((sum,value)=>sum+value.counters.total,0):undefined;
 return <><header className="usage-dialog-head"><div><span className="usage-eyebrow">YOUR AI WORKSPACE</span><strong id="usage-title">Usage overview</strong></div><button type="button" className="icon-button" aria-label="Close usage" onClick={onClose}>×</button></header>
 <p className="usage-dialog-caption">Tokens used. Limits remaining. All in one place.</p>
 <div className="usage-token-overview">
  <div><span className="usage-section-label">Total recorded tokens</span><strong className="usage-token-total" aria-live="polite">{state.tokenPending?<span className="usage-loading usage-loading-total">Reading…</span>:total===undefined?'—':<TokenNumber value={total}/>}</strong><span className="usage-hero-caption">Across all workspaces on this machine</span></div>
  <div className="usage-range" role="group" aria-label="Token usage period">{([['today','Today'],['7d','7 days'],['30d','30 days'],['all','All']] as const).map(([range,label])=><button key={range} type="button" aria-pressed={state.tokenRange===range} onClick={()=>onRange(range)}>{label}</button>)}</div>
 </div>
 {state.tokenError&&<p className="usage-data-warning" role="status">{state.tokenError}</p>}
 {state.tokens?.partial&&<p className="usage-data-warning" role="status">Partial history: some logs could not be read.</p>}
 <div className="usage-cards">{ALL_PROVIDERS.map(provider=>{
  const value=state.data.get(provider),tokens=state.tokens?.providers.find(row=>row.provider===provider),hasTokens=Boolean(tokens?.available&&tokens.supported),unavailable=value&&!value.available&&!hasTokens;
  return <section key={provider} className={`usage-card${unavailable?' usage-card-unavailable':''}`} aria-label={`${providerName(provider)} usage`}>
   <header className="usage-provider-head"><div className="usage-provider-name"><span className={`usage-provider-icon usage-icon-${provider}`}><img src={`/agents/${provider}.svg`} alt=""/></span><strong>{providerName(provider)}</strong></div><div className="usage-provider-total">{state.tokenPending?<span className="usage-loading">Reading…</span>:hasTokens&&tokens?<><strong><TokenNumber value={tokens.counters.total}/></strong><span>tokens</span></>:<span className="usage-no-data">No token data</span>}</div></header>
   {hasTokens&&tokens&&!state.tokenPending?<><dl className="usage-token-breakdown"><div><dt>Input</dt><dd><TokenNumber value={tokens.counters.input}/></dd></div><div><dt>Output</dt><dd><TokenNumber value={tokens.counters.output}/></dd></div></dl><details className="usage-cache-details"><summary>Cache details</summary><dl className="usage-token-breakdown"><div><dt>Cache read</dt><dd><TokenNumber value={tokens.counters.cacheRead}/></dd></div><div><dt>Cache write</dt><dd><TokenNumber value={tokens.counters.cacheWrite}/></dd></div></dl><p>Already included in input tokens.</p></details></>:!state.tokenPending&&<p className="usage-unavailable">{tokens?.message||'Token history unavailable'}</p>}
   {value?.available?<div className="usage-quota-grid">{([['5 hours',value.fiveHour],['Weekly',value.weekly]] as const).map(([label,limit])=>{
    const valid=limit&&(!limit.resetsAt||Date.parse(limit.resetsAt)>Date.now()),rem=valid?Math.floor(Math.max(0,Math.min(100,100-limit.usedPercent))):null,status=rem===null?'unknown':rem===0?'exhausted':rem<20?'near-limit':'quota-healthy';
    return <div key={label} className={`usage-quota-item ${status}`}><div className="usage-detail-line"><span>{label}</span>{rem!==null?<span className={`usage-quota-val ${status}`} title={rem===0?'Quota exhausted':rem<20?'Low quota: less than 20% remaining':undefined}>{rem<20&&<span aria-label={rem===0?'Quota exhausted':'Low quota'}>⚠</span>}<span>{rem}%</span><span className="usage-quota-label">remaining</span></span>:<span className="usage-quota-val">—</span>}</div>{rem!==null?<progress className="usage-quota-bar" value={rem} max={100} aria-label={`${providerName(provider)} ${label} quota remaining`}/>:<div className="usage-quota-track"/>}{valid&&limit.resetsAt?<small className="usage-reset-time" title={new Date(limit.resetsAt).toLocaleString()}>Resets in {resetIn(limit.resetsAt)}</small>:<small className="usage-reset-time">{rem===null?'Limit unavailable':'Reset time unavailable'}</small>}</div>;
   })}</div>:<p className="usage-unavailable usage-quota-message">{value?.message||(value?'Quota unavailable':'Loading quota…')}</p>}
   {value?.stale&&<small className="usage-stale">Last known quota · {value.message||'Could not refresh limits'}</small>}
  </section>;
 })}</div>
 <footer className="usage-dashboard-footer"><div><p className="usage-token-note">Current quotas · token totals follow the selected period</p>{state.tokens&&<p className="usage-token-note">Updated {new Date(state.tokens.updatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>}</div><button type="button" className="usage-refresh secondary-button" disabled={state.detailsPending||state.tokenPending} onClick={onRefresh}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/></svg>{state.detailsPending||state.tokenPending?'Refreshing…':'Refresh'}</button></footer></>;
}
export function createUsagePanel({api}:{api:Api}){
 const footer=document.querySelector('.sidebar-footer')!,settings=document.querySelector<HTMLButtonElement>('#settings')!;
 settings.setAttribute('aria-label','Settings');settings.title='Settings';for(const node of [...settings.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();settings.classList.add('sidebar-tool');
 const trigger=document.createElement('button');trigger.id='usage-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='Usage';trigger.setAttribute('aria-label','Usage');trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 4v16h16M8 16v-5M13 16V7M18 16v-8"/></svg>';footer.prepend(trigger);
 const dialog=document.createElement('dialog');dialog.id='usage-dialog';dialog.setAttribute('aria-labelledby','usage-title');document.body.append(dialog);
 const panel=document.createElement('section');panel.id='sidebar-usage';panel.className='compact-usage';panel.setAttribute('aria-label','Account quota remaining');footer.after(panel);
 const miniRoot=createRoot(panel),detailsRoot=createRoot(dialog),roots:Root[]=[miniRoot,detailsRoot];
 const state:Snapshot={enabled:true,providers:['claude','codex'],mode:'auto',data:new Map(),detailsPending:false,tokenPending:false,tokenRange:'today',tokens:null,tokenError:''};
 try{state.enabled=localStorage.getItem('ai-web.show-usage')!=='false';const saved=JSON.parse(localStorage.getItem('ai-web.usage-display')||'null');if(Array.isArray(saved?.providers))state.providers=(['claude','codex'] as const).filter(provider=>saved.providers.includes(provider));if(['auto','5h','7d','both'].includes(saved?.windows))state.mode=saved.windows;}catch{}
 let generation=0,pending=false,disposed=false,tokenGeneration=0;
 const controls=document.createElement('div');document.querySelector('.settings-footnote')!.before(controls);
 const controlRoots=Array.from({length:4},()=>{const row=document.createElement('div');row.className='setting-row';controls.append(row);const root=createRoot(row);roots.push(root);return root;});
 function saveDisplay(){generation++;try{localStorage.setItem('ai-web.usage-display',JSON.stringify({providers:state.providers,windows:state.mode}));}catch{}render();void refresh();}
 function render(){
  if(disposed)return;panel.hidden=!state.enabled||!state.providers.length;
  const snapshot={...state,data:new Map(state.data),providers:[...state.providers]};
  miniRoot.render(<MiniUsage state={snapshot} onOpen={()=>trigger.click()}/>);
  detailsRoot.render(<UsageDetails state={snapshot} onClose={()=>dialog.close()} onRefresh={()=>{void refreshDetails();void refreshTokens();}} onRange={range=>{state.tokenRange=range;void refreshTokens();}}/>);
  controlRoots[0].render(<><div><strong>Show usage</strong><small>One-line quota remaining below the sidebar tools</small></div><input type="checkbox" aria-label="Show usage" checked={state.enabled} onChange={event=>{state.enabled=event.target.checked;generation++;try{localStorage.setItem('ai-web.show-usage',String(state.enabled));}catch{}render();void refresh();}}/></>);
  ALL_PROVIDERS.forEach((provider,index)=>controlRoots[index+1].render(<><div><strong>{providerName(provider)}</strong><small>Show {providerName(provider)} in the sidebar quota line</small></div><input type="checkbox" aria-label={`Show ${providerName(provider)} usage`} checked={state.providers.includes(provider)} onChange={event=>{const chosen=new Set(state.providers);if(event.target.checked)chosen.add(provider);else chosen.delete(provider);state.providers=(['claude','codex'] as const).filter(item=>chosen.has(item));saveDisplay();}}/></>));
  controlRoots[3].render(<><div><strong>Quota window</strong><small>Choose which limits appear in the sidebar</small></div><select aria-label="Usage quota window" value={state.mode} onChange={event=>{state.mode=event.target.value as QuotaMode;saveDisplay();}}><option value="auto">Closest to limit</option><option value="5h">5 hours</option><option value="7d">Weekly</option><option value="both">Both</option></select></>);
 }
 async function refreshDetails(){if(state.detailsPending||disposed)return;state.detailsPending=true;render();try{const result=await api<{providers:AccountQuota[]}>('/api/account-usage?providers=codex,claude');if(!disposed)for(const value of result.providers)state.data.set(value.provider,value);}catch{for(const provider of ALL_PROVIDERS)if(!state.data.has(provider))state.data.set(provider,{provider,available:false,message:'Could not load usage. Try refreshing.'});}finally{state.detailsPending=false;render();}}
 async function refresh(){if(!state.enabled||!state.providers.length||pending||document.hidden||disposed)return;pending=true;const stamp=generation;try{const result=await api<{providers:AccountQuota[]}>(`/api/account-usage?providers=${state.providers.join(',')}`);if(stamp===generation&&!disposed){for(const value of result.providers)state.data.set(value.provider,value);render();}}catch{if(stamp===generation)for(const provider of state.providers)if(!state.data.has(provider))state.data.set(provider,{provider,available:false});render();}finally{pending=false;if(stamp!==generation)void refresh();}}
 async function refreshTokens(){
  if(disposed)return;const stamp=++tokenGeneration;state.tokenPending=true;state.tokenError='';render();
  const start=new Date();start.setHours(0,0,0,0);if(state.tokenRange==='7d')start.setDate(start.getDate()-6);if(state.tokenRange==='30d')start.setDate(start.getDate()-29);
  const since=state.tokenRange==='all'?0:start.getTime();
  try{const result=await api<TokenUsageSnapshot>(`/api/token-usage?since=${since}`);if(!disposed&&stamp===tokenGeneration)state.tokens=result;}
  catch{if(!disposed&&stamp===tokenGeneration){state.tokens=null;state.tokenError='Could not load token history. Try refreshing.';}}
  finally{if(stamp===tokenGeneration){state.tokenPending=false;render();}}
 }
 trigger.onclick=()=>{if(!dialog.open)dialog.showModal();render();void refreshDetails();void refreshTokens();};
 dialog.addEventListener('close',()=>trigger.focus());dialog.onclick=event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();};
 const timer=setInterval(()=>{render();void refresh();if(dialog.open){void refreshDetails();if(!state.tokenPending)void refreshTokens();}},60000),onVisible=()=>{if(!document.hidden){void refresh();if(dialog.open)void refreshTokens();}};document.addEventListener('visibilitychange',onVisible);flushSync(render);void refresh();
 return {setAgents(_agents:readonly {agent:string}[]=[]){render();},dispose(){disposed=true;generation++;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);for(const root of roots)root.unmount();panel.remove();dialog.remove();trigger.remove();controls.remove();}};
}
