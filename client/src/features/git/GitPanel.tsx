import {GitHubPanel} from './GitHubPanel.tsx';
import {CommitFileTree} from './CommitFileTree.tsx';
import {Fragment,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import type {Api,Workspace,NativeIcon} from '../../components/contracts.ts';
import type {GitSnapshot,GitHistory,GitCommitDetails,GitCommitFile,GitHubItem} from '../../../../shared/contracts.ts';
import {forgetTabPosition} from '../layout/tab-position.ts';
import {graphRows} from './graph-layout.ts';

interface State {project:Workspace|null;status:GitSnapshot|null;statusError:string;history:GitHistory|null;details:GitCommitDetails|null;selected:string|null;filter:string;search:string;limit:number;loading:boolean;detailLoading:boolean;busy:string;error:string;notice:string}
const colors=['var(--primary)','var(--git-blue)','var(--success)','var(--git-purple)','var(--warning)','var(--git-teal)'];
function SyncControls({state,onAction,onRemote,remote}:{state:State;onAction:(action:string)=>void;onRemote:(remote:string)=>void;remote:string}){
 const status=state.status;if(!status?.available)return null;
 const blocked=Boolean(state.busy),canPull=Boolean(status.head&&status.branch&&status.upstream&&status.remote===remote&&!status.dirty&&!status.conflicted),canPush=Boolean(status.head&&status.branch&&!status.conflicted&&(!status.upstream||status.remote===remote));
 return <><div className="git-branch-summary"><strong title={status.branch||status.head||''}>{status.branch||status.head?.slice(0,8)||'No commits'}</strong>{status.upstream?<span title={status.upstream}>{status.upstream.replace(/^refs\/(heads|remotes)\//,'')}</span>:<span>{status.head?'No upstream':'Create your first commit in the terminal'}</span>}</div>
 <div className="git-sync-counts"><span title="Commits not pushed">↑ {status.ahead} ahead</span><span title="Commits available from the last fetch">↓ {status.behind} behind</span>{status.dirty&&<span>Local changes</span>}</div>
 <div className="git-sync-actions">{status.remotes.length>0&&<select aria-label="Git remote" value={remote} disabled={blocked} onChange={event=>onRemote(event.target.value)}>{status.remotes.map(name=><option key={name}>{name}</option>)}</select>}
 <button type="button" disabled={blocked||!remote} onClick={()=>onAction('fetch')}>{state.busy==='fetch'?'Fetching…':'Fetch'}</button>
 <button type="button" disabled={blocked||!canPull} title={status.dirty?'Commit or stash local changes before pulling.':'Fetch and pull with fast-forward only.'} onClick={()=>onAction('pull')}>{state.busy==='pull'?'Pulling…':'Pull'}</button>
 <button type="button" disabled={blocked||!remote||!canPush} title={status.upstream?'Push commits to the upstream branch.':'Publish this branch to the selected remote.'} onClick={()=>onAction('push')}>{state.busy==='push'?'Pushing…':status.upstream?'Push':'Publish branch'}</button></div></>;
}
function Graph({history,selected,onSelect,details}:{history:GitHistory;selected:string|null;onSelect:(hash:string)=>void;details:ReactNode}){
 const prefix=useId();
 const layout=graphRows(history.commits),graphWidth=layout.width*18+18,rowHeight=52;
 const detailRef=useRef<HTMLDivElement>(null),[detailHeight,setDetailHeight]=useState(320);
 const expanded=history.commits.findIndex(commit=>commit.hash===selected);
 useLayoutEffect(()=>{const node=detailRef.current;if(!node)return;const measure=()=>{const height=node.getBoundingClientRect().height;if(height>0)setDetailHeight(height);};measure();const observer=new ResizeObserver(measure);observer.observe(node);return ()=>observer.disconnect();},[selected]);
 const rowY=(index:number)=>index*rowHeight+(expanded>=0&&index>expanded?detailHeight:0);

 return <div className="git-history-scroll"><div className="git-history-list" style={{minWidth:graphWidth+420}}>
 <svg className="git-lanes" style={{width:graphWidth,height:history.commits.length*rowHeight+(expanded>=0?detailHeight:0)}} aria-hidden="true">
 {layout.rows.flatMap((row,index)=>row.segments.map((edge,edgeIndex)=>{const x1=18+edge.from*18,x2=18+edge.to*18,y1=rowY(index)+rowHeight/2,y2=rowY(index+1)+rowHeight/2;return <path key={`${index}-${edgeIndex}`} d={index===expanded?`M${x1} ${y1} C${x1} ${y1+26} ${x2} ${y1+26} ${x2} ${y1+52} L${x2} ${y2}`:`M${x1} ${y1} C${x1} ${y1+26} ${x2} ${y2-26} ${x2} ${y2}`} fill="none" stroke={colors[edge.color%colors.length]} strokeWidth="2"/>;}))}
 {layout.rows.map((row,index)=><circle key={index} cx={18+row.lane*18} cy={rowY(index)+rowHeight/2} r={history.commits[index].parents.length>1?5:4} fill={history.commits[index].hash===history.head?colors[row.color%colors.length]:'var(--canvas)'} stroke={colors[row.color%colors.length]} strokeWidth="2"/>)}</svg>
 {history.commits.map(commit=><Fragment key={commit.hash}><button type="button" id={`${prefix}-commit-${commit.hash}`} data-commit-hash={commit.hash} className={`git-commit-row${selected===commit.hash?' selected':''}`} style={{gridTemplateColumns:`${graphWidth}px minmax(240px,1fr) 140px`}} aria-pressed={selected===commit.hash} aria-expanded={selected===commit.hash} aria-controls={selected===commit.hash?`${prefix}-details`:undefined} aria-label={`View commit ${commit.hash.slice(0,8)}: ${commit.subject}`} onClick={()=>onSelect(commit.hash)}>
 <span/><span className="git-commit-copy"><span className="git-commit-subject">{commit.subject||'(no message)'}</span><span className="git-ref-labels">{commit.hash===history.head&&<span className="git-ref-head">HEAD</span>}{history.refs.filter(ref=>ref.hash===commit.hash).map(ref=><span key={ref.ref} className={`git-ref-${ref.kind}`} title={`${ref.kind}: ${ref.name}`}>{ref.name}</span>)}</span></span><span className="git-commit-meta"><code>{commit.hash.slice(0,8)}</code><span title={commit.date}>{commit.author} · {new Date(commit.date).toLocaleDateString()}</span></span>
 </button>{selected===commit.hash&&<div ref={detailRef} id={`${prefix}-details`} className="git-inline-details" style={{marginLeft:graphWidth}}>{details}</div>}</Fragment>)}
 </div></div>;
}
interface GitWorkspaceOptions {api:Api;icon:NativeIcon;project:Workspace;onChanged:()=>void;onOpenDiff:(project:Workspace,hash:string,file:GitCommitFile)=>Promise<void>;onStartIssue:(project:Workspace,issue:GitHubItem)=>void;onBusyChanged:()=>void}
function createGitWorkspace({api,project,onChanged,onOpenDiff,onStartIssue,onBusyChanged}:GitWorkspaceOptions){
 const getProject=()=>project;
 const panel=document.createElement('section');panel.className='git-workspace';panel.id=`git-workspace-${project.id}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-label',`Git · ${project.name}`);panel.tabIndex=-1;
 const graphRoot=createRoot(panel,{identifierPrefix:`git-${project.id}-`});
 let disposed=false,opened=false;
 const state:State={project:null,status:null,statusError:'',history:null,details:null,selected:null,filter:'all',search:'',limit:80,loading:false,detailLoading:false,busy:'',error:'',notice:''};
 let view:'graph'|'pulls'|'issues'='graph';
 let generation=0,statusSequence=0,historySequence=0,detailSequence=0,remote='';
 const query=(route:string,extra:Record<string,string>={})=>`${route}?${new URLSearchParams({project:state.project!.id,...extra})}`;
 function setRemote(value:string){remote=value;state.notice='';draw();}
 function draw(){
  const controls=<SyncControls state={state} remote={remote} onRemote={setRemote} onAction={action=>void perform(action)}/>;
  if(disposed)return;
  const history=state.history;
  // Keep the complete ancestry while searching: fading unmatched rows preserves the graph.
  const matches=history?.commits.filter(commit=>`${commit.subject} ${commit.author} ${commit.hash} ${history.refs.filter(ref=>ref.hash===commit.hash).map(ref=>ref.name).join(' ')}`.toLowerCase().includes(state.search.toLowerCase()))||[];
  graphRoot.render(<><header className="git-graph-heading"><div><span className="git-eyebrow">{state.project?.name}</span><h2>Git</h2></div></header>
   <nav className="git-view-tabs" role="tablist" aria-label="Git sections" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key)||state.busy)return;event.preventDefault();const tabs=['graph','pulls','issues'] as const;const next=tabs[(tabs.indexOf(view)+(event.key==='ArrowRight'?1:2))%3];view=next;draw();requestAnimationFrame(()=>panel.querySelector<HTMLButtonElement>(`[data-git-view="${next}"]`)?.focus());}}>{([['graph','Graph'],['pulls','Pull requests'],['issues','Issues']] as const).map(([value,label])=><button key={value} type="button" role="tab" data-git-view={value} aria-selected={view===value} tabIndex={view===value?0:-1} disabled={Boolean(state.busy)} onClick={()=>{view=value;draw();}}>{label}</button>)}</nav>
   {view==='graph'?<><div className="git-graph-toolbar"><div>{controls}</div><div className="git-graph-filters"><label>Show<select aria-label="Git history branch" value={state.filter} disabled={Boolean(state.busy)||state.loading} onChange={event=>{state.filter=event.target.value;state.limit=80;void loadHistory();}}><option value="all">All branches</option>{state.status?.head&&<option value="HEAD">Current branch</option>}{state.status?.refs.map(ref=><option key={ref.ref} value={ref.ref}>{ref.name} · {ref.kind}</option>)}</select></label><label>Find<input type="search" aria-label="Find commits" value={state.search} placeholder="Message, branch, author, hash" onChange={event=>{state.search=event.target.value;state.notice='';draw();}}/></label><button type="button" className="secondary-button" disabled={state.loading||Boolean(state.busy)} onClick={()=>{void refresh();void loadHistory();}}>Refresh</button></div></div>
   <div className={`git-graph-feedback${state.error?' error':''}`} role={state.error?'alert':'status'}>{state.error||state.statusError||state.notice|| (state.loading?'Loading commits…':state.search?`${matches.length} matching commits`:'History reflects the last fetch. Fetch to check for remote updates.')}</div>
   <div className="git-graph-content"><section className="git-history-main" aria-label="Commit graph">
   {history?.commits.length?<><div className="git-history-results" ref={node=>{if(node)node.querySelectorAll<HTMLButtonElement>('.git-commit-row').forEach(row=>row.classList.toggle('git-search-dimmed',Boolean(state.search)&&!matches.some(commit=>row.getAttribute('aria-label')?.startsWith(`View commit ${commit.hash.slice(0,8)}:`))));}}><Graph history={history} selected={state.selected} onSelect={hash=>void selectCommit(hash)} details={state.selected&&<aside className="git-commit-details" aria-label="Commit details"><header><strong>Commit details</strong><button type="button" className="icon-button" aria-label="Close commit details" onClick={closeDetails}>×</button></header>{state.detailLoading?<p>Loading commit…</p>:state.details&&<><div className="git-details-columns"><div className="git-details-message"><code className="git-full-hash">{state.details.hash}</code><p className="git-author">{state.details.author} · {new Date(state.details.date).toLocaleString()}</p><p className="git-feedback">Parents: {state.details.parents.length?state.details.parents.map(hash=>hash.slice(0,12)).join(', '):'Root commit'}</p><pre className="git-commit-message">{state.details.message}</pre></div><div className="git-details-files"><h3>Changed files <span>{state.details.files.length}</span></h3><p className="git-feedback">{state.details.parents.length>1?'Merge changes compared with its first parent.':'Select a file to view its diff.'}</p><CommitFileTree key={state.details.hash} files={state.details.files} onOpen={file=>void openFile(file)}/>{state.details.truncated&&<p>Showing the first 300 changed files.</p>}</div></div></>}</aside>}/></div>{history.hasMore&&<button type="button" className="git-load-more secondary-button" disabled={state.loading||state.limit>=400} onClick={()=>{state.limit+=80;void loadHistory();}}>{state.limit>=400?'Showing the first 400 commits':'Load more commits'}</button>}</>:<p className="git-empty">{state.loading?'Loading commit history…':state.status?.available===false?'This workspace is not a Git repository.':state.error||state.statusError?'Could not load history. Use Refresh to retry.':'No commits yet. Create your first commit in the terminal.'}</p>}
   </section></div></>:state.project&&<GitHubPanel key={`${state.project.id}:${view}`} api={api} project={state.project} kind={view} onBusy={busy=>{state.busy=busy?'draft':'';draw();onBusyChanged();}} onStartIssue={issue=>{const project=state.project;if(project)onStartIssue(project,issue);}}/>}
  </>);
 }
 async function refresh(){
  const project=getProject();if(!project){return;}
  if(state.project?.id!==project.id)reset(project);
  const stamp=++statusSequence,identity=generation;
  try{const result=await api<GitSnapshot>(query('/api/git/status'));if(identity!==generation||stamp!==statusSequence)return;state.status=result;state.statusError='';if(!result.remotes.includes(remote))remote=result.remote&&result.remotes.includes(result.remote)?result.remote:(result.remotes.includes('origin')?'origin':result.remotes[0])||'';}
  catch(failure){if(identity===generation&&stamp===statusSequence)state.statusError=failure instanceof Error?failure.message:'Could not load Git status.';}
  if(identity===generation)draw();
 }
 function reset(project:Workspace|null){view='graph';generation++;statusSequence++;historySequence++;detailSequence++;remote='';Object.assign(state,{project,status:null,statusError:'',history:null,details:null,selected:null,filter:'all',search:'',limit:80,loading:false,detailLoading:false,error:'',notice:''});draw();}
 async function loadHistory(){
  if(!state.project)return;const identity=generation,stamp=++historySequence;state.loading=true;state.error='';draw();
  try{const history=await api<GitHistory>(query('/api/git/history',{ref:state.filter,limit:String(state.limit)}));if(identity===generation&&stamp===historySequence){state.history=history;if(state.selected&&!history.commits.some(commit=>commit.hash===state.selected)){detailSequence++;state.selected=null;state.details=null;}}}
  catch(failure){if(identity===generation&&stamp===historySequence)state.error=failure instanceof Error?failure.message:'Could not load Git history.';}
  finally{if(identity===generation&&stamp===historySequence){state.loading=false;draw();}}
 }
 function closeDetails(){const hash=state.selected;detailSequence++;state.selected=null;state.details=null;state.detailLoading=false;draw();requestAnimationFrame(()=>{if(hash)panel.querySelector<HTMLElement>(`[data-commit-hash="${hash}"]`)?.focus({preventScroll:true});});}
 async function selectCommit(hash:string){
  if(state.selected===hash){closeDetails();return;}
  const stamp=++detailSequence,identity=generation;state.selected=hash;state.details=null;state.detailLoading=true;state.error='';draw();
  try{const details=await api<GitCommitDetails>(query('/api/git/commit',{hash}));if(identity===generation&&stamp===detailSequence)state.details=details;}
  catch(failure){if(identity===generation&&stamp===detailSequence)state.error=failure instanceof Error?failure.message:'Could not load commit.';}
  finally{if(identity===generation&&stamp===detailSequence){state.detailLoading=false;draw();}}
 }
 async function openFile(file:GitCommitFile){const project=state.project,hash=state.selected;if(!project||!hash)return;try{await onOpenDiff(project,hash,file);}catch(failure){state.error=failure instanceof Error?failure.message:'Could not open this diff.';draw();}}
 async function perform(action:string){
  if(state.busy||!state.status||!state.project)return;const identity=generation,project=state.project,status=state.status;state.busy=action;state.error='';state.notice='';draw();onBusyChanged();
  try{const result=await api<{message:string;state:GitSnapshot}>(`/api/git/sync?${new URLSearchParams({project:project.id})}`,{method:'POST',body:JSON.stringify({action,remote,expectedHead:status.head,expectedBranch:status.branch})});if(identity!==generation)return;state.status=result.state;state.notice=result.message;onChanged();await loadHistory();}
  catch(failure){if(identity===generation){state.error=failure instanceof Error?failure.message:'Git operation failed.';await refresh();}}
  finally{state.busy='';draw();onBusyChanged();}
 }
 async function open(){if(!opened){opened=true;reset(project);}flushSync(draw);await refresh();if(!disposed&&state.status?.available&&view==='graph')await loadHistory();}
 return {element:panel,open,refresh,get busy(){return Boolean(state.busy);},dispose(){disposed=true;generation++;graphRoot.unmount();panel.remove();}};
}

interface GitPanelOptions extends Omit<GitWorkspaceOptions,'project'|'onBusyChanged'> {getProject:()=>Workspace|null;onActivate:(project:Workspace)=>void;onDeactivate:()=>void;onTabsChanged:()=>void}
export function createGitPanel(options:GitPanelOptions){
 const {getProject,icon,onTabsChanged}=options;
 const trigger=document.createElement('button');trigger.id='git-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='Git';trigger.setAttribute('aria-label','Git');trigger.append(icon('branch'));document.querySelector('#usage-open')!.before(trigger);
 const host=document.createElement('div');host.className='git-workspace-host';host.hidden=true;document.querySelector('#content-views')!.append(host);
 const entries=new Map<string,{project:Workspace;workspace:ReturnType<typeof createGitWorkspace>}>();
 let active:string|null=null;
 function deactivate(){if(active===null)return;active=null;host.hidden=true;document.querySelector('#app')!.classList.remove('git-active');options.onDeactivate();onTabsChanged();}
 function activate(entry:{project:Workspace;workspace:ReturnType<typeof createGitWorkspace>}){
  options.onActivate(entry.project);active=entry.project.id;
  for(const value of entries.values())value.workspace.element.hidden=value!==entry;
  host.hidden=false;document.querySelector('#app')!.classList.add('git-active');onTabsChanged();entry.workspace.element.focus({preventScroll:true});void entry.workspace.open();
 }
 function close(id:string){const entry=entries.get(id);if(!entry||entry.workspace.busy)return;if(active===id)deactivate();entries.delete(id);forgetTabPosition(`file:git:${id}`);entry.workspace.dispose();onTabsChanged();}
 trigger.disabled=!getProject();
 function prepare(project:Workspace){let entry=entries.get(project.id);if(!entry){const workspace=createGitWorkspace({...options,project:{...project},onBusyChanged:onTabsChanged});entry={project:{...project},workspace};entries.set(project.id,entry);host.append(workspace.element);}return entry;}
 trigger.onclick=()=>{const selected=getProject();if(selected)activate(prepare(selected));};
 return {
  prepare,get openProjects(){return [...entries.keys()];},get busy(){return [...entries.values()].some(entry=>entry.workspace.busy);},deactivate,restore(projectId:string){const entry=entries.get(projectId);if(!entry)return false;activate(entry);return true;},get activeProject(){return active;},refresh(){const entry=active?entries.get(active):undefined;return entry?.workspace.refresh();},
  projectChanged(){trigger.disabled=!getProject();if(active&&active!==getProject()?.id)deactivate();},
  appendTabs(container:HTMLElement){for(const [id,entry] of entries){
   if(id!==getProject()?.id)continue;
   const tab=document.createElement('div');tab.className=`file-tab git-workspace-tab${active===id?' active':''}`;tab.dataset.tabKey=`git:${id}`;tab.setAttribute('role','tab');tab.setAttribute('aria-label',`Git · ${entry.project.name}`);tab.setAttribute('aria-selected',String(active===id));tab.setAttribute('aria-controls',entry.workspace.element.id);tab.tabIndex=0;tab.title=`Git · ${entry.project.name} · ${entry.project.root}`;tab.append(icon('branch'));
   const label=document.createElement('span');label.className='tab-name';label.textContent=`Git · ${entry.project.name}`;tab.append(label);
   const button=document.createElement('button');button.type='button';button.className='tab-close';button.disabled=entry.workspace.busy;button.setAttribute('aria-label',`Close Git · ${entry.project.name}`);button.append(icon('close'));button.onclick=event=>{event.stopPropagation();close(id);};tab.append(button);
   tab.onclick=()=>activate(entry);tab.onkeydown=event=>{if(event.target===tab&&['Enter',' '].includes(event.key)){event.preventDefault();activate(entry);}};container.append(tab);
  }}
 };
}
