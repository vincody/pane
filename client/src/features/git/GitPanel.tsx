import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import type {Api,Workspace,NativeIcon} from '../../components/contracts.ts';
import type {GitSnapshot,GitHistory,GitCommitDetails,GitCommitFile} from '../../../../shared/contracts.ts';
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
function Graph({history,selected,onSelect}:{history:GitHistory;selected:string|null;onSelect:(hash:string)=>void}){
 const layout=graphRows(history.commits),graphWidth=layout.width*18+18,rowHeight=52;
 return <div className="git-history-scroll"><div className="git-history-list" style={{minWidth:graphWidth+420}}>
 <svg className="git-lanes" style={{width:graphWidth,height:history.commits.length*rowHeight}} aria-hidden="true">
 {layout.rows.flatMap((row,index)=>row.segments.map((edge,edgeIndex)=>{const x1=18+edge.from*18,x2=18+edge.to*18,y1=index*rowHeight+rowHeight/2,y2=y1+rowHeight;return <path key={`${index}-${edgeIndex}`} d={`M${x1} ${y1} C${x1} ${y1+26} ${x2} ${y2-26} ${x2} ${y2}`} fill="none" stroke={colors[edge.color%colors.length]} strokeWidth="2"/>;}))}
 {layout.rows.map((row,index)=><circle key={index} cx={18+row.lane*18} cy={index*rowHeight+rowHeight/2} r={history.commits[index].parents.length>1?5:4} fill={history.commits[index].hash===history.head?colors[row.color%colors.length]:'var(--canvas)'} stroke={colors[row.color%colors.length]} strokeWidth="2"/>)}</svg>
 {history.commits.map(commit=><button type="button" key={commit.hash} className={`git-commit-row${selected===commit.hash?' selected':''}`} style={{gridTemplateColumns:`${graphWidth}px minmax(240px,1fr) 140px`}} aria-pressed={selected===commit.hash} aria-label={`View commit ${commit.hash.slice(0,8)}: ${commit.subject}`} onClick={()=>onSelect(commit.hash)}>
 <span/><span className="git-commit-copy"><span className="git-commit-subject">{commit.subject||'(no message)'}</span><span className="git-ref-labels">{commit.hash===history.head&&<span className="git-ref-head">HEAD</span>}{history.refs.filter(ref=>ref.hash===commit.hash).map(ref=><span key={ref.ref} className={`git-ref-${ref.kind}`} title={`${ref.kind}: ${ref.name}`}>{ref.name}</span>)}</span></span><span className="git-commit-meta"><code>{commit.hash.slice(0,8)}</code><span title={commit.date}>{commit.author} · {new Date(commit.date).toLocaleDateString()}</span></span>
 </button>)}
 </div></div>;
}
export function createGitPanel({api,icon,getProject,onChanged,onOpenDiff}:{api:Api;icon:NativeIcon;getProject:()=>Workspace|null;onChanged:()=>void;onOpenDiff:(project:Workspace,hash:string,file:GitCommitFile)=>Promise<void>}){
 const trigger=document.createElement('button');trigger.id='git-open';trigger.type='button';trigger.className='sidebar-tool';trigger.title='Git';trigger.setAttribute('aria-label','Git');trigger.setAttribute('aria-haspopup','dialog');trigger.append(icon('branch'));document.querySelector('#usage-open')!.before(trigger);
 const dialog=document.createElement('dialog');dialog.id='git-graph-dialog';dialog.setAttribute('aria-labelledby','git-graph-title');document.body.append(dialog);
 const graphRoot=createRoot(dialog);
 const state:State={project:null,status:null,statusError:'',history:null,details:null,selected:null,filter:'all',search:'',limit:80,loading:false,detailLoading:false,busy:'',error:'',notice:''};
 let generation=0,statusSequence=0,historySequence=0,detailSequence=0,remote='';
 const query=(route:string,extra:Record<string,string>={})=>`${route}?${new URLSearchParams({project:state.project!.id,...extra})}`;
 function setRemote(value:string){remote=value;state.notice='';draw();}
 function close(){if(!state.busy)dialog.close();}
 function draw(){
  trigger.disabled=!getProject();
  const controls=<SyncControls state={state} remote={remote} onRemote={setRemote} onAction={action=>void perform(action)}/>;
  if(!dialog.open)return;
  const history=state.history;
  // Keep the complete ancestry while searching: fading unmatched rows preserves the graph.
  const matches=history?.commits.filter(commit=>`${commit.subject} ${commit.author} ${commit.hash} ${history.refs.filter(ref=>ref.hash===commit.hash).map(ref=>ref.name).join(' ')}`.toLowerCase().includes(state.search.toLowerCase()))||[];
  graphRoot.render(<><header className="git-graph-heading"><div><span className="git-eyebrow">{state.project?.name}</span><h2 id="git-graph-title">Git history</h2></div><button type="button" className="icon-button" aria-label="Close Git history" disabled={Boolean(state.busy)} onClick={close}>×</button></header>
   <div className="git-graph-toolbar"><div>{controls}</div><div className="git-graph-filters"><label>Show<select aria-label="Git history branch" value={state.filter} disabled={Boolean(state.busy)||state.loading} onChange={event=>{state.filter=event.target.value;state.limit=80;void loadHistory();}}><option value="all">All branches</option>{state.status?.head&&<option value="HEAD">Current branch</option>}{state.status?.refs.map(ref=><option key={ref.ref} value={ref.ref}>{ref.name} · {ref.kind}</option>)}</select></label><label>Find<input type="search" aria-label="Find commits" value={state.search} placeholder="Message, branch, author, hash" onChange={event=>{state.search=event.target.value;state.notice='';draw();}}/></label><button type="button" className="secondary-button" disabled={state.loading||Boolean(state.busy)} onClick={()=>{void refresh();void loadHistory();}}>Refresh</button></div></div>
   <div className={`git-graph-feedback${state.error?' error':''}`} role={state.error?'alert':'status'}>{state.error||state.statusError||state.notice|| (state.loading?'Loading commits…':state.search?`${matches.length} matching commits`:'History reflects the last fetch. Fetch to check for remote updates.')}</div>
   <div className={`git-graph-content${state.selected?' has-details':''}`}><section className="git-history-main" aria-label="Commit graph">
   {history?.commits.length?<><div className="git-history-results" ref={node=>{if(node)node.querySelectorAll<HTMLButtonElement>('.git-commit-row').forEach(row=>row.classList.toggle('git-search-dimmed',Boolean(state.search)&&!matches.some(commit=>row.getAttribute('aria-label')?.startsWith(`View commit ${commit.hash.slice(0,8)}:`))));}}><Graph history={history} selected={state.selected} onSelect={hash=>void selectCommit(hash)}/></div>{history.hasMore&&<button type="button" className="git-load-more secondary-button" disabled={state.loading||state.limit>=400} onClick={()=>{state.limit+=80;void loadHistory();}}>{state.limit>=400?'Showing the first 400 commits':'Load more commits'}</button>}</>:<p className="git-empty">{state.loading?'Loading commit history…':state.status?.available===false?'This workspace is not a Git repository.':state.error||state.statusError?'Could not load history. Use Refresh to retry.':'No commits yet. Create your first commit in the terminal.'}</p>}
   </section>{state.selected&&<aside className="git-commit-details" aria-label="Commit details"><header><strong>Commit details</strong><button type="button" className="icon-button" aria-label="Close commit details" onClick={()=>{detailSequence++;state.selected=null;state.details=null;draw();}}>×</button></header>{state.detailLoading?<p>Loading commit…</p>:state.details&&<><code className="git-full-hash">{state.details.hash}</code><p className="git-author">{state.details.author} · {new Date(state.details.date).toLocaleString()}</p><pre className="git-commit-message">{state.details.message}</pre><h3>Changed files <span>{state.details.files.length}</span></h3><p className="git-feedback">{state.details.parents.length>1?'Merge changes compared with its first parent.':'Select a file to view its diff.'}</p>{state.details.files.map(file=><button key={file.path} type="button" className="git-commit-file" onClick={()=>void openFile(file)}><span className="git-file-status">{file.status}</span><span>{file.path}{file.previousPath&&<small>from {file.previousPath}</small>}</span></button>)}{state.details.truncated&&<p>Showing the first 300 changed files.</p>}</>}</aside>}</div>
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
 function reset(project:Workspace|null){generation++;statusSequence++;historySequence++;detailSequence++;remote='';Object.assign(state,{project,status:null,statusError:'',history:null,details:null,selected:null,filter:'all',search:'',limit:80,loading:false,detailLoading:false,error:'',notice:''});if(dialog.open&&!state.busy)dialog.close();draw();}
 async function loadHistory(){
  if(!state.project)return;const identity=generation,stamp=++historySequence;state.loading=true;state.error='';draw();
  try{const history=await api<GitHistory>(query('/api/git/history',{ref:state.filter,limit:String(state.limit)}));if(identity===generation&&stamp===historySequence){state.history=history;if(state.selected&&!history.commits.some(commit=>commit.hash===state.selected)){detailSequence++;state.selected=null;state.details=null;}}}
  catch(failure){if(identity===generation&&stamp===historySequence)state.error=failure instanceof Error?failure.message:'Could not load Git history.';}
  finally{if(identity===generation&&stamp===historySequence){state.loading=false;draw();}}
 }
 async function selectCommit(hash:string){
  const stamp=++detailSequence,identity=generation;state.selected=hash;state.details=null;state.detailLoading=true;state.error='';draw();
  try{const details=await api<GitCommitDetails>(query('/api/git/commit',{hash}));if(identity===generation&&stamp===detailSequence)state.details=details;}
  catch(failure){if(identity===generation&&stamp===detailSequence)state.error=failure instanceof Error?failure.message:'Could not load commit.';}
  finally{if(identity===generation&&stamp===detailSequence){state.detailLoading=false;draw();}}
 }
 async function openFile(file:GitCommitFile){const project=state.project,hash=state.selected;if(!project||!hash)return;try{await onOpenDiff(project,hash,file);dialog.close();}catch(failure){state.error=failure instanceof Error?failure.message:'Could not open this diff.';draw();}}
 async function perform(action:string){
  if(state.busy||!state.status||!state.project)return;const identity=generation,project=state.project,status=state.status;state.busy=action;state.error='';state.notice='';draw();
  try{const result=await api<{message:string;state:GitSnapshot}>(`/api/git/sync?${new URLSearchParams({project:project.id})}`,{method:'POST',body:JSON.stringify({action,remote,expectedHead:status.head,expectedBranch:status.branch})});if(identity!==generation)return;state.status=result.state;state.notice=result.message;onChanged();if(dialog.open)await loadHistory();}
  catch(failure){if(identity===generation){state.error=failure instanceof Error?failure.message:'Git operation failed.';await refresh();}}
  finally{state.busy='';draw();}
 }
 async function open(){const project=getProject();if(!project)return;if(state.project?.id!==project.id)reset(project);if(!dialog.open)dialog.showModal();flushSync(draw);await refresh();if(state.status?.available)await loadHistory();}
 dialog.oncancel=event=>{if(state.busy)event.preventDefault();};
 trigger.onclick=()=>void open();dialog.addEventListener('close',()=>trigger.focus());draw();
 return {refresh,projectChanged(){reset(getProject());}};
}
