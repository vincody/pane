import {BranchCombobox} from '../../components/BranchCombobox.tsx';
import {useEffect,useId,useRef,useState} from 'react';

import {githubLists,githubListKey,type GitHubList} from './github-list-cache.ts';
import {Body} from './GitHubMarkdown.tsx';

import type {Api,Workspace} from '../../components/contracts.ts';

import type {GitHubContext,GitHubItem,GitHubPull,GitHubPullDetails,GitHubPullFile} from '../../../../shared/contracts.ts';

import {PullStatus} from './PullStatus.tsx';
import {IssueComposer} from './IssueComposer.tsx';
import {IssueStatus} from './IssueStatus.tsx';
import {PullConversation} from './PullConversation.tsx';

import {CommitFileTree} from './CommitFileTree.tsx';





const issuePrompt=(issue:GitHubItem)=>`Issue #${issue.number}: ${issue.title}\n${issue.url}\n\n${issue.body}\n\nPlease investigate this issue, implement a focused fix, and run the relevant checks.`;

export function GitHubPanel({api,project,kind,onStartIssue,onBusy}:{api:Api;project:Workspace;kind:'pulls'|'issues';onStartIssue:(issue:GitHubItem)=>void;onBusy:(busy:boolean)=>void}){

 const fields=useId();
 const [initialList]=useState(()=>githubLists.get(githubListKey(project,kind,'open')));
 const [context,setContext]=useState<GitHubContext|null>(null),[items,setItems]=useState<GitHubItem[]>(initialList?.data.items||[]),[limited,setLimited]=useState(initialList?.data.limited||false),[loading,setLoading]=useState(!initialList?.fresh),[state,setState]=useState('open'),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);

 const [selected,setSelected]=useState<number|null>(null),[details,setDetails]=useState<GitHubPullDetails|GitHubItem|null>(null),[detailLoading,setDetailLoading]=useState(false),[section,setSection]=useState<'overview'|'files'|'checks'>('overview'),[file,setFile]=useState<GitHubPullFile|null>(null);

 const [composingIssue,setComposingIssue]=useState(false);
 const createdIssueSelection=useRef<GitHubItem|null>(null);
 const [draft,setDraft]=useState(false),[title,setTitle]=useState(''),[description,setDescription]=useState('## Summary\n\n\n## Validation\n\n'),[base,setBase]=useState(''),[creating,setCreating]=useState(false);

 const [sectionLoading,setSectionLoading]=useState(false);

 const loadedSections=useRef(new Set<string>());

 const detailSequence=useRef(0),mounted=useRef(true),detailController=useRef<AbortController|null>(null);

 const url=(route:string,extra:Record<string,string>={})=>`/api/github/${route}?${new URLSearchParams({project:project.id,...extra})}`;

 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;detailSequence.current++;detailController.current?.abort();};},[]);

 const [connectionError,setConnectionError]=useState('');
 useEffect(()=>{
  let canceled=false;const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12_000);
  setConnectionError('');
  void api<GitHubContext>(url('context',refresh?{fresh:'1'}:{}),{signal:controller.signal}).then(ctx=>{if(canceled)return;setContext(ctx);setBase(value=>value||ctx.repository?.defaultBranch||'');}).catch(failure=>{if(!canceled)setConnectionError(controller.signal.aborted?'Repository check timed out. You can still browse loaded items. Try Refresh.':failure instanceof Error?failure.message:'Could not check the repository.');}).finally(()=>clearTimeout(timer));
  return ()=>{canceled=true;clearTimeout(timer);controller.abort();};
 },[project.id,refresh]);
 useEffect(()=>{
  const key=githubListKey(project,kind,state),cached=githubLists.get(key),cacheGeneration=githubLists.generation();
  detailController.current?.abort();setError('');setSelected(createdIssueSelection.current?.number??null);setDetails(createdIssueSelection.current);createdIssueSelection.current=null;setDetailLoading(false);detailSequence.current++;
  if(cached){setItems(cached.data.items);setLimited(cached.data.limited);}else{setItems([]);setLimited(false);}
  if(cached?.fresh&&!refresh){setLoading(false);return;}
  let canceled=false;const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12_000);setLoading(true);
  void api<GitHubList>(url(kind,{state,...(refresh?{fresh:'1'}:{})}),{signal:controller.signal}).then(data=>{if(!canceled&&cacheGeneration===githubLists.generation()){githubLists.set(key,data,cacheGeneration);setItems(data.items);setLimited(data.limited);}}).catch(failure=>{if(!canceled)setError(controller.signal.aborted?'GitHub is taking too long to respond. Check your connection and try Refresh.':failure instanceof Error?failure.message:'Could not load GitHub.');}).finally(()=>{clearTimeout(timer);if(!canceled)setLoading(false);});
  return ()=>{canceled=true;clearTimeout(timer);controller.abort();};
 },[project.id,kind,state,refresh]);

 async function view(item:GitHubItem){
  setComposingIssue(false);
  detailController.current?.abort();const controller=new AbortController();detailController.current=controller;
  const timer=setTimeout(()=>controller.abort(),12_000);
  loadedSections.current.clear();setSectionLoading(false);const request=++detailSequence.current;setSelected(item.number);setDetails(kind==='issues'?item:null);setDetailLoading(kind!=='issues');setError('');setSection('overview');setFile(null);setDraft(false);
  try{const data=await api<GitHubPullDetails|GitHubItem>(url(kind==='pulls'?'pull':'issue',{number:String(item.number),...(kind==='pulls'?{section:'summary'}:{}),...(refresh?{fresh:'1'}:{})}),{signal:controller.signal});if(mounted.current&&request===detailSequence.current)setDetails(data);}
  catch(failure){if(mounted.current&&request===detailSequence.current)setError(controller.signal.aborted?'GitHub details took too long to respond. Try opening the item again.':failure instanceof Error?failure.message:'Could not load details.');}
  finally{clearTimeout(timer);if(mounted.current&&request===detailSequence.current)setDetailLoading(false);}
 }


 useEffect(()=>{

  if(kind!=='pulls'||section==='overview'||!selected||loadedSections.current.has(section))return;

  const sequence=detailSequence.current;let canceled=false;setSectionLoading(true);setError('');

  void api<GitHubPullDetails>(url('pull',{number:String(selected),section})).then(data=>{if(canceled||sequence!==detailSequence.current)return;loadedSections.current.add(section);setDetails(previous=>previous&&'pull' in previous?{...previous,...(section==='files'?{files:data.files,truncated:data.truncated}:{checks:data.checks,checksMessage:data.checksMessage})}:previous);}).catch(failure=>{if(!canceled&&sequence===detailSequence.current)setError(failure instanceof Error?failure.message:'Could not load PR section. Switch tabs to retry.');}).finally(()=>{if(!canceled&&sequence===detailSequence.current)setSectionLoading(false);});

  return ()=>{canceled=true;};

 },[section,selected]);

 async function create(event:React.FormEvent){event.preventDefault();if(!context?.canCreate||creating)return;setCreating(true);onBusy(true);setError('');

  try{const result=await api<GitHubPull>(url('draft'),{method:'POST',body:JSON.stringify({title:title.trim(),body:description,base,expectedHead:context.head,expectedBranch:context.branch})});if(!mounted.current)return;githubLists.clear();setNotice(`Draft PR #${result.number} created.`);setItems(previous=>[result,...previous.filter(item=>item.number!==result.number)]);setDraft(false);await view(result);}

  catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'Could not create draft PR.');}finally{if(mounted.current)setCreating(false);onBusy(false);}

 }

 function issueCreated(issue:GitHubItem,requested:string[]){
  const previous=githubLists.get(githubListKey(project,'issues','open'))?.data;
  githubLists.clear();const data={items:[issue,...(previous?.items||[]).filter(value=>value.number!==issue.number)],limited:previous?.limited||false};githubLists.set(githubListKey(project,'issues','open'),data);
  if(state!=='open')createdIssueSelection.current=issue;
  setState('open');setSearch('');setItems(data.items);setLimited(data.limited);setSelected(issue.number);setDetails(issue);setDetailLoading(false);setComposingIssue(false);
  const missing=requested.filter(name=>!issue.labels.some(label=>label.toLowerCase()===name.toLowerCase()));setNotice(`Issue #${issue.number} created.${missing.length?` GitHub did not apply these labels: ${missing.join(', ')}. Check your repository permissions.`:''}`);
 }

 const pr=details&&'pull' in details?details:null,issue=details&&!('pull' in details)?details:null,active=pr?.pull||issue;

 const filtered=items.filter(item=>`${item.number} ${item.title} ${item.author} ${item.labels.join(' ')}`.toLowerCase().includes(search.toLowerCase()));

 return <section className="github-page" aria-label={kind==='pulls'?'Pull requests':'Issues'}>

  <div className="github-toolbar"><div><strong>{context?.repository?.name||'GitHub'}</strong><span>{kind==='pulls'?'Review branches and open draft pull requests.':'Choose an issue and start a worktree.'}</span></div><div><label className="sr-only" htmlFor={`${fields}-state`}>State</label><select id={`${fields}-state`} value={state} disabled={creating} onChange={event=>setState(event.target.value)}><option value="open">Open</option><option value="closed">Closed</option><option value="all">All</option></select><input type="search" aria-label={kind==='pulls'?'Find pull requests':'Find issues'} placeholder="Find in loaded items…" value={search} onChange={event=>setSearch(event.target.value)}/><button type="button" className="secondary-button" disabled={loading||creating} onClick={()=>setRefresh(value=>value+1)}>Refresh</button>{kind==='pulls'&&<button type="button" className="primary-button" disabled={!context?.canCreate||creating} title="Push or publish the current branch to origin first." onClick={()=>{setDraft(true);setDetailLoading(false);setTitle(context?.branch?.replace(/[-_/]/g,' ')||'');setSelected(null);setDetails(null);detailSequence.current++;}}>New draft PR</button>}{kind==='issues'&&<button type="button" className="primary-button" disabled={creating||!context?.available} onClick={()=>{detailController.current?.abort();detailSequence.current++;setComposingIssue(true);setSelected(null);setDetails(null);setDetailLoading(false);setError('');setNotice('');}}>New issue</button>}</div></div>

  {connectionError&&<p className="github-feedback error" role="alert">{connectionError}</p>}{error&&<p className="github-feedback error" role="alert">{error}</p>}{notice&&<p className="github-feedback" role="status">{notice}</p>}{loading&&items.length>0&&<p className="github-feedback" role="status">Updating {kind==='pulls'?'pull requests':'issues'}…</p>}

  {context&&!context.available&&!items.length?<div className="github-empty"><h3>Connect this workspace to GitHub</h3><p>{context.message}</p><p>Pane uses your local GitHub CLI sign-in. Run <code>gh auth login</code> in a terminal, then Refresh.</p></div>:<>

  {kind==='pulls'&&context&&!context.canCreate&&<p className="github-feedback">To create a draft, choose a feature worktree and push or publish its branch from Graph first.</p>}

  <div className="github-content"><section className="github-items" aria-label={kind==='pulls'?'Pull request list':'Issue list'}>{loading&&!items.length?<p className="git-empty" role="status">Loading {kind==='pulls'?'pull requests':'issues'}…</p>:!filtered.length?<p className="git-empty">No {kind==='pulls'?'pull requests':'issues'} found.</p>:filtered.map(item=><button key={item.number} type="button" disabled={creating} className={`github-item${selected===item.number?' selected':''}`} aria-pressed={selected===item.number} onClick={()=>void view(item)}><span className="github-item-title">{kind==='pulls'?<PullStatus pull={item}/>:<IssueStatus issue={item}/>}<span>{item.title}</span></span><span>#{item.number} · {item.author} · {item.state==='open'&&('draft' in item&&item.draft)?'draft':item.state}</span><span className="github-labels">{item.labels.map(label=><span key={label}>{label}</span>)}</span></button>)}{limited&&<p className="github-feedback">Showing up to 50 of the most recently updated items. Open GitHub for the full list.</p>}</section>

  <section className="github-details" aria-label={composingIssue?'Create new issue':draft?'Create draft pull request':kind==='pulls'?'Pull request details':'Issue details'}>

  {composingIssue?<IssueComposer api={api} project={project} repository={context?.repository?.name||project.name} onCancel={()=>setComposingIssue(false)} onBusy={busy=>{setCreating(busy);onBusy(busy);}} onCreated={issueCreated}/>:draft&&context?<form className="github-draft" onSubmit={event=>void create(event)}><h3>Create draft pull request</h3><p>Repository: <strong>{context.repository?.name}</strong></p><p><code>{context.headBranch}</code> → <code>{base}</code></p><div className="github-base-field"><span>Base branch</span><BranchCombobox value={base} options={context.bases} disabled={creating} onChange={setBase}/></div><label>Title<input aria-label="PR title" value={title} maxLength={256} required disabled={creating} onChange={event=>setTitle(event.target.value)}/></label><label>Description<textarea aria-label="PR description" value={description} maxLength={65_536} rows={10} disabled={creating} onChange={event=>setDescription(event.target.value)}/></label><p className="github-note">Only pushed commits are included.{context.dirty?' Your uncommitted changes are not part of this PR.':''}</p><div className="dialog-actions"><button type="button" className="secondary-button" disabled={creating} onClick={()=>setDraft(false)}>Cancel</button><button type="submit" className="primary-button" disabled={creating||!title.trim()||!base.trim()||base===context.headBranch}>{creating?'Creating draft…':'Create draft PR'}</button></div></form>:

   detailLoading?<p className="git-empty">Loading details…</p>:!active?<p className="git-empty">Select {kind==='pulls'?'a pull request':'an issue'} to view its details.</p>:<><header className="github-detail-heading"><div><span>#{active.number} · {active.state}{pr?.pull.draft?' · Draft':''}</span><h3>{pr?<PullStatus pull={pr.pull}/>:<IssueStatus issue={active}/>}<span>{active.title}</span></h3><p>{active.author} · Updated {new Date(active.updatedAt).toLocaleDateString()}</p>{pr&&<p><code>{pr.pull.head}</code> → <code>{pr.pull.base}</code> · {pr.pull.mergeable}</p>}</div><a href={active.url} target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a></header>

   {pr?<><div className="github-detail-tabs" role="tablist" aria-label="Pull request sections">{(['overview','files','checks'] as const).map(value=><button type="button" role="tab" key={value} aria-selected={section===value} disabled={creating} onClick={()=>setSection(value)}>{value==='overview'?'Conversation':value==='files'?(loadedSections.current.has('files')?`Files (${pr.files.length})`:'Files'):(loadedSections.current.has('checks')?`Checks (${pr.checks.length})`:'Checks')}</button>)}</div><div hidden={section!=='overview'}><PullConversation key={`${project.id}:${active.number}`} api={api} project={project} pull={pr.pull} onBusy={busy=>{setCreating(busy);onBusy(busy);}}/></div>{section==='overview'?null:sectionLoading?<p role="status">Loading {section}…</p>:section==='checks'?<div className="github-checks">{pr.checksMessage&&<p>{pr.checksMessage}</p>}{!pr.checks.length&&<p>No checks reported.</p>}{pr.checks.map((check,index)=><div key={index} data-result={check.conclusion||check.status}><span><strong>{check.name}</strong><small>{check.conclusion||check.status}</small></span>{check.url&&<a href={check.url} target="_blank" rel="noopener noreferrer">Details ↗</a>}</div>)}</div>:<div className="github-pr-files"><CommitFileTree files={pr.files} onOpen={value=>setFile(pr.files.find(item=>item.path===value.path)||null)}/>{pr.truncated&&<p>File list limited to 100 files. View all changes on GitHub.</p>}{file&&<section aria-label="Pull request file diff"><h4>{file.path}</h4>{file.patch?<pre className="github-patch">{file.patch.split('\n').map((line,index)=><span key={index} className={line.startsWith('+')?'added':line.startsWith('-')?'removed':line.startsWith('@@')?'hunk':''}>{line}{'\n'}</span>)}</pre>:<p>Text diff unavailable or too large. Open this PR on GitHub to view the file.</p>}</section>}</div>}</>:

   issue&&<><div className="github-issue-actions"><button type="button" className="primary-button" onClick={()=>onStartIssue(issue)}>Start working</button><button type="button" className="secondary-button" onClick={()=>{void Promise.resolve().then(()=>navigator.clipboard.writeText(issuePrompt(issue))).then(()=>setNotice('Issue prompt copied. Paste it into your AI session.')).catch(()=>setError('Could not copy. Select the issue description and copy it manually.'));}}>Copy prompt</button><span>Create a worktree with the issue context in its note.</span></div><Body body={issue.body}/></>}

  </>}

  </section></div></>}

 </section>;

}
