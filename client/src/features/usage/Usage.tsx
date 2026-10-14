import {createRoot,type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {miniQuota} from './quota-mini.ts';
import type {Api,Provider,QuotaMode,AccountQuota} from '../../components/contracts';
interface Snapshot {enabled:boolean;providers:Provider[];mode:QuotaMode;data:Map<Provider,AccountQuota>;detailsPending:boolean}
const providerName=(provider:Provider)=>provider==='codex'?'Codex':'Claude';
function MiniUsage({state,onOpen}:{state:Snapshot;onOpen:()=>void}){
 return <>{state.providers.map(provider=>{
   const value=state.data.get(provider),label=providerName(provider),{windows,tightest}=miniQuota(value),shown=state.mode==='auto'?(tightest?[tightest]:[]):windows.filter(window=>state.mode==='both'||window.label===state.mode);
   const display=(label:string)=>`${label} ${windows.find(window=>window.label===label)?.remaining??'—'}${windows.some(window=>window.label===label)?'%':''}`;
   const text=state.mode==='both'?`${display('5h')} · ${display('7d')}`:shown.length?`${shown[0].remaining}% · ${shown[0].label}`:state.mode==='auto'?'—':`${state.mode} —`;
   const details=windows.map(window=>`${window.label}: ${window.remaining}% remaining${window.resetsAt?`; resets ${new Date(window.resetsAt).toLocaleString()}`:''}`);
   const title=[label,...(details.length?details:[value?.message||(!value?'Loading account usage':'Limit unavailable or expired')]),...(value?.stale?['Last known quota; refresh unavailable']:[]),'Open usage details'].join('\n');
   return <button key={provider} type="button" className={`compact-usage-line${shown.some(window=>window.used>=90)?' near-limit':''}`} onClick={onOpen} title={title} aria-label={`${label}: ${details.join('; ')||'Quota unavailable'}. Open usage details`}><span>{label}</span><span>{text}</span></button>;
 })}</>;
}
function UsageDetails({state,onClose,onRefresh}:{state:Snapshot;onClose:()=>void;onRefresh:()=>void}){
 return <><header className="usage-dialog-head"><strong id="usage-title">Usage</strong><button type="button" className="icon-button" aria-label="Close usage" onClick={onClose}>×</button></header><p className="usage-dialog-caption">Account quota remaining</p><div className="usage-dialog-content">
   {(['codex','claude'] as const).map(provider=>{const value=state.data.get(provider);return <section key={provider} className="usage-provider"><strong>{providerName(provider)}</strong>{value?.available?([['5 hours',value.fiveHour],['Weekly',value.weekly]] as const).map(([label,limit])=>{const valid=limit&&(!limit.resetsAt||Date.parse(limit.resetsAt)>Date.now());return <div key={label}><div className="usage-detail-line"><span>{label}</span><strong>{valid?`${Math.round(Math.max(0,Math.min(100,100-limit.usedPercent)))}% remaining`:'—'}</strong></div>{valid&&limit.resetsAt&&<small className="usage-unavailable">Resets {new Date(limit.resetsAt).toLocaleString()}</small>}</div>;}):<small className="usage-unavailable">{value?.message||(value?'Usage unavailable':'Loading…')}</small>}</section>;})}
 </div><button type="button" className="usage-refresh secondary-button" disabled={state.detailsPending} onClick={onRefresh}>{state.detailsPending?'Refreshing…':'Refresh'}</button></>;
}
export function createUsagePanel({api}:{api:Api}){
 const footer=document.querySelector('.sidebar-footer')!,settings=document.querySelector<HTMLButtonElement>('#settings')!;
 settings.setAttribute('aria-label','Settings');settings.title='Settings';for(const node of [...settings.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();settings.classList.add('sidebar-tool');
 const trigger=document.createElement('button');trigger.id='usage-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='Usage';trigger.setAttribute('aria-label','Usage');trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 18a9 9 0 1 1 16 0M12 3v2M5.6 6.6 7 8M18.4 6.6 17 8M3 12h2M19 12h2M12 14l4-5"/><circle cx="12" cy="14" r="1.5"/></svg>';footer.prepend(trigger);
 const dialog=document.createElement('dialog');dialog.id='usage-dialog';dialog.setAttribute('aria-labelledby','usage-title');document.body.append(dialog);
 const panel=document.createElement('section');panel.id='sidebar-usage';panel.className='compact-usage';panel.setAttribute('aria-label','Account quota remaining');footer.after(panel);
 const miniRoot=createRoot(panel),detailsRoot=createRoot(dialog),roots:Root[]=[miniRoot,detailsRoot];
 const state:Snapshot={enabled:true,providers:['claude','codex'],mode:'auto',data:new Map(),detailsPending:false};
 try{state.enabled=localStorage.getItem('ai-web.show-usage')!=='false';const saved=JSON.parse(localStorage.getItem('ai-web.usage-display')||'null');if(Array.isArray(saved?.providers))state.providers=state.providers.filter(provider=>saved.providers.includes(provider));if(['auto','5h','7d','both'].includes(saved?.windows))state.mode=saved.windows;}catch{}
 let generation=0,pending=false,disposed=false;
 const controls=document.createElement('div');document.querySelector('.settings-footnote')!.before(controls);
 const controlRoots=Array.from({length:4},()=>{const row=document.createElement('div');row.className='setting-row';controls.append(row);const root=createRoot(row);roots.push(root);return root;});
 function saveDisplay(){generation++;try{localStorage.setItem('ai-web.usage-display',JSON.stringify({providers:state.providers,windows:state.mode}));}catch{}render();void refresh();}
 function render(){
  if(disposed)return;panel.hidden=!state.enabled||!state.providers.length;
  const snapshot={...state,data:new Map(state.data),providers:[...state.providers]};
  miniRoot.render(<MiniUsage state={snapshot} onOpen={()=>trigger.click()}/>);
  detailsRoot.render(<UsageDetails state={snapshot} onClose={()=>dialog.close()} onRefresh={()=>void refreshDetails()}/>);
  controlRoots[0].render(<><div><strong>Show usage</strong><small>One-line quota remaining below the sidebar tools</small></div><input type="checkbox" aria-label="Show usage" checked={state.enabled} onChange={event=>{state.enabled=event.target.checked;generation++;try{localStorage.setItem('ai-web.show-usage',String(state.enabled));}catch{}render();void refresh();}}/></>);
  (['codex','claude'] as const).forEach((provider,index)=>controlRoots[index+1].render(<><div><strong>{providerName(provider)}</strong><small>Show {providerName(provider)} in the sidebar quota line</small></div><input type="checkbox" aria-label={`Show ${providerName(provider)} usage`} checked={state.providers.includes(provider)} onChange={event=>{const chosen=new Set(state.providers);if(event.target.checked)chosen.add(provider);else chosen.delete(provider);state.providers=(['claude','codex'] as const).filter(item=>chosen.has(item));saveDisplay();}}/></>));
  controlRoots[3].render(<><div><strong>Quota window</strong><small>Choose which limits appear in the sidebar</small></div><select aria-label="Usage quota window" value={state.mode} onChange={event=>{state.mode=event.target.value as QuotaMode;saveDisplay();}}><option value="auto">Closest to limit</option><option value="5h">5 hours</option><option value="7d">Weekly</option><option value="both">Both</option></select></>);
 }
 async function refreshDetails(){if(state.detailsPending||disposed)return;state.detailsPending=true;render();try{const result=await api<{providers:AccountQuota[]}>('/api/account-usage?providers=codex,claude');if(!disposed)for(const value of result.providers)state.data.set(value.provider,value);}catch{for(const provider of ['codex','claude'] as const)if(!state.data.has(provider))state.data.set(provider,{provider,available:false,message:'Could not load usage. Try refreshing.'});}finally{state.detailsPending=false;render();}}
 async function refresh(){if(!state.enabled||!state.providers.length||pending||document.hidden||disposed)return;pending=true;const stamp=generation;try{const result=await api<{providers:AccountQuota[]}>(`/api/account-usage?providers=${state.providers.join(',')}`);if(stamp===generation&&!disposed){for(const value of result.providers)state.data.set(value.provider,value);render();}}catch{if(stamp===generation)for(const provider of state.providers)if(!state.data.has(provider))state.data.set(provider,{provider,available:false});render();}finally{pending=false;if(stamp!==generation)void refresh();}}
 trigger.onclick=()=>{if(!dialog.open)dialog.showModal();render();void refreshDetails();};
 dialog.addEventListener('close',()=>trigger.focus());dialog.onclick=event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();};
 const timer=setInterval(()=>{render();void refresh();},60000),onVisible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',onVisible);flushSync(render);void refresh();
 return {setAgents(_agents:readonly {agent:string}[]=[]){render();},dispose(){disposed=true;generation++;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);for(const root of roots)root.unmount();panel.remove();dialog.remove();trigger.remove();controls.remove();}};
}
