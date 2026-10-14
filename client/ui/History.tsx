import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {workspaceForSession} from '../history-session.ts';
import {errorMessage,type Api,type HistorySession,type Workspace} from './contracts';

interface Props {api:Api; getProjects:()=>Workspace[]; getCurrentProject:()=>Workspace|null; onResume:(record:HistorySession,project:Workspace)=>void|Promise<void>}
function History({props,trigger,dialog}: {props:Props;trigger:HTMLButtonElement;dialog:HTMLDialogElement}) {
  const [projects,setProjects]=useState<Workspace[]>([]),[records,setRecords]=useState<HistorySession[]>([]),[query,setQuery]=useState(''),[filter,setFilter]=useState(''),[loading,setLoading]=useState(false),[resuming,setResuming]=useState(false),[error,setError]=useState(''),[resumeError,setResumeError]=useState('');
  const request=useRef(0),busy=useRef(false),search=useRef<HTMLInputElement>(null);
  async function load(){const stamp=++request.current;setLoading(true);setError('');try{const result=await props.api<{sessions:HistorySession[]}>('/api/local-sessions');if(stamp===request.current)setRecords(result.sessions||[]);}catch(failure){if(stamp===request.current)setError(errorMessage(failure,'Could not load history. Try refreshing.'));}finally{if(stamp===request.current)setLoading(false);}}
  useEffect(()=>{
    trigger.onclick=()=>{if(dialog.open)return;setProjects(props.getProjects());setFilter(props.getCurrentProject()?.id||'');setQuery('');setResumeError('');dialog.showModal();void load();search.current?.focus();};
    const close=()=>{request.current++;trigger.focus();};dialog.addEventListener('close',close);
    return ()=>{request.current++;trigger.onclick=null;dialog.removeEventListener('close',close);};
  },[props,trigger,dialog]);
  const groups=new Map<string,{project:Workspace;records:HistorySession[]}>();
  for(const record of [...records].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))){
    const project=workspaceForSession(record,projects) as Workspace|undefined;
    if(!project||(filter&&project.id!==filter)||!['codex','claude'].includes(record.agent))continue;
    if(query.trim()&&!`${record.name} ${record.agent} ${project.name}`.toLowerCase().includes(query.trim().toLowerCase()))continue;
    if(!groups.has(project.id))groups.set(project.id,{project,records:[]});groups.get(project.id)!.records.push(record);
  }
  const count=[...groups.values()].reduce((total,group)=>total+group.records.length,0);
  const status=loading?'Loading history…':error||resumeError|| (resuming?'Opening terminal…':count?`${count} conversation${count===1?'':'s'}`:query?'No matching conversations.':'No saved Codex or Claude conversations in this workspace.');
  async function resume(record:HistorySession,project:Workspace){if(busy.current)return;busy.current=true;setResuming(true);setResumeError('');try{await props.onResume(record,project);dialog.close();}catch(failure){setResumeError(errorMessage(failure,'Could not resume session.'));}finally{busy.current=false;setResuming(false);}}
  return <><header className="usage-dialog-head"><strong id="history-title">History</strong><button type="button" className="icon-button" aria-label="Close history" onClick={()=>dialog.close()}>×</button></header>
    <div className="history-filters"><input ref={search} type="search" aria-label="Search history" placeholder="Search conversations…" value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="History workspace" value={filter} onChange={event=>setFilter(event.target.value)}><option value="">All workspaces</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select><button type="button" className="icon-button" aria-label="Refresh history" title="Refresh history" disabled={loading} onClick={()=>void load()}>↻</button></div>
    <p className="history-status" role="status">{status}</p><div className="history-list">{!loading&&!error&&[...groups.values()].map(group=><section key={group.project.id}><h3>{group.project.name}</h3>{group.records.map(record=>{const title=record.name||`${record.agent} session`,date=new Date(record.updatedAt);return <button key={record.id} type="button" className="history-session" disabled={resuming} title={`Resume ${title}\n${record.cwd}`} aria-label={`Resume ${record.agent}: ${title}`} onClick={()=>void resume(record,group.project)}><img src={`/agents/${record.agent}.svg`} alt=""/><span className="history-session-copy"><strong>{title}</strong><small>{record.agent==='codex'?'Codex':'Claude'} · {Number.isNaN(date.getTime())?'Unknown date':date.toLocaleString()}</small></span></button>;})}</section>)}</div></>;
}
export function setupHistory(props:Props){
  const trigger=document.createElement('button');trigger.id='history-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='History';trigger.setAttribute('aria-label','History');trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/></svg>';document.querySelector('.sidebar-footer')!.prepend(trigger);
  const dialog=document.createElement('dialog');dialog.id='history-dialog';dialog.setAttribute('aria-labelledby','history-title');document.body.append(dialog);const root=createRoot(dialog);
  flushSync(()=>root.render(<History props={props} trigger={trigger} dialog={dialog}/>));
  return {open:()=>trigger.click(),dispose(){root.unmount();dialog.remove();trigger.remove();}};
}
