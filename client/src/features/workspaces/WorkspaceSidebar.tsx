import {agentLabel} from '../../../../shared/agent-label.ts';
import {useLayoutEffect,useRef,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Icon} from '../../components/bridge';
import type {NativeIcon,TerminalAgent,Workspace} from '../../components/contracts';
import {needsAttention,workspaceLead,type WorkspaceLead} from './session-attention';
import type {DiffStat} from './workspace-diff';
import {avatarHue,avatarLetter} from './project-avatar';
interface Options {
 icon:NativeIcon;
 onSelect:(project:Workspace)=>void;
 onCreateSubWorkspace:(project:Workspace)=>void;
 onAgentSelect:(id:string)=>void;
 onMenu:(project:Workspace,x:number,y:number,origin:HTMLElement)=>void;
 setupDrag:(project:Workspace,button:HTMLButtonElement,group:HTMLElement)=>void;
}
interface State {projects:Workspace[];currentProjectId:string|null;agents:TerminalAgent[];diffs:ReadonlyMap<string,DiffStat>}
const LEAD_LABEL:Record<WorkspaceLead,string>={failed:'Agent failed',blocked:'Needs your input',working:'Agent working',review:'Ready for review',idle:''};
/** Status glyph at the start of a workspace row; the badge overlays the base glyph. */
function Lead({kind,local,icon}:{kind:WorkspaceLead;local:boolean;icon:NativeIcon}){
 const label=LEAD_LABEL[kind];
 return <span className="workspace-lead" data-lead={kind} data-local={local||undefined} title={label||undefined} role={label?'img':undefined} aria-label={label||undefined} aria-hidden={label?undefined:true}>
  {local?<Icon name="laptop" icon={icon}/>:kind==='working'?<span className="wave-spinner" aria-hidden="true">{Array.from({length:9},(_,index)=><i key={index} style={{'--cell':Math.floor(index/3)+index%3} as CSSProperties}/>)}</span>:<span className="lead-ring"/>}
  {(kind==='failed'||kind==='blocked'||kind==='review'||local&&kind==='working')&&<span className="lead-badge"/>}
 </span>;
}
function WorkspaceCard({project,contexts,currentProjectId,agents,diffs,options}: {project:Workspace;contexts:Workspace[];currentProjectId:string|null;agents:TerminalAgent[];diffs:ReadonlyMap<string,DiffStat>;options:Options}){
 const selected=currentProjectId===project.id,groupSelected=contexts.some(context=>context.id===currentProjectId);
 const group=useRef<HTMLElement>(null),button=useRef<HTMLButtonElement>(null);
 useLayoutEffect(()=>{options.setupDrag(project,button.current!,group.current!);},[project,options]);
 const attention=agents.filter(needsAttention).length;
 return <section ref={group} className={`workspace-group${groupSelected?' selected':''}`} data-project={project.id}><div className="project-row">
  <button ref={button} className={`project-button${selected?' active':''}`} aria-current={selected?'page':undefined} title={project.root} onClick={()=>options.onSelect(project)} onContextMenu={event=>{event.preventDefault();options.onMenu(project,event.clientX,event.clientY,event.currentTarget);}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();options.onMenu(project,rect.left+20,rect.bottom,event.currentTarget);}}}><span className="project-avatar" style={{'--hue':avatarHue(project.name)} as CSSProperties} aria-hidden="true">{avatarLetter(project.name)}</span><span className="project-text">{project.name}</span>{attention>0&&<span className="workspace-attention" title={`${attention} ${attention===1?'session requires':'sessions require'} your input or review`}><b>{attention}</b><span className="workspace-attention-label"> {attention===1?'needs':'need'} attention</span></span>}</button>
  <button type="button" className="project-add" aria-label={`New worktree in ${project.name}`} title="New worktree" onClick={()=>options.onCreateSubWorkspace(project)}><Icon name="plus" icon={options.icon}/></button>
  <button className="project-more" aria-label={`Actions for ${project.name}`} aria-haspopup="menu" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();options.onMenu(project,rect.left,rect.bottom,event.currentTarget);}}><Icon name="more" icon={options.icon}/></button>
 </div><div id={`workspace-children-${project.id}`} className="workspace-children">{contexts.map(context=><div key={context.id} className={`workspace-context${currentProjectId===context.id?' selected':''}`} data-context={context.id}>
  <div className="workspace-context-row"><button type="button" className={`workspace-context-button${context.parentId?'':' workspace-branch-only'}`} aria-label={`Open ${context.parentId?context.name:context.branch||'Folder'} in ${project.name}`} aria-current={currentProjectId===context.id?'page':undefined} title={`${context.parentId?context.name:context.branch||'Folder'} · ${context.root}`} onClick={()=>options.onSelect(context)} onContextMenu={event=>{event.preventDefault();options.onMenu(context,event.clientX,event.clientY,event.currentTarget);}}><Lead kind={workspaceLead(agents.filter(agent=>agent.project===context.id))} local={!context.parentId} icon={options.icon}/><span className={`workspace-context-text${context.parentId?'':' is-local'}`}>{context.parentId?<span className="workspace-context-name">{context.name}</span>:<span className="workspace-local-label">local</span>}<span className="workspace-branch" title={context.branch?`Git branch: ${context.branch}`:'Local folder'}>{context.branch||(context.parentId?context.name:'Folder')}</span></span>{(diffs.get(context.id)?.added||diffs.get(context.id)?.removed)?<span className="workspace-diff" title={`${diffs.get(context.id)!.added} lines added, ${diffs.get(context.id)!.removed} removed`}><b>+{diffs.get(context.id)!.added}</b><i>−{diffs.get(context.id)!.removed}</i></span>:null}</button>{context.parentId&&<button type="button" className="project-more" aria-label={`Actions for ${context.name}`} aria-haspopup="menu" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();options.onMenu(context,rect.left,rect.bottom,event.currentTarget);}}><Icon name="more" icon={options.icon}/></button>}</div>{context.note&&<p className="workspace-context-note" title={context.note}>{context.note}</p>}
  <div className="workspace-context-sessions">{agents.filter(agent=>agent.project===context.id).map(agent=>{const status=({working:'Working',blocked:'Needs your input',idle:'Ready',done:'Completed',error:'Error',failed:'Error'} as Record<string,string>)[agent.status]||agent.status,title=agent.name===project.name?agentLabel(agent.agent):agent.name,detail=`${agentLabel(agent.agent)} · ${status}`;return <button key={agent.id} type="button" className={`agent-card terminal-agent-card${agent.selected?' selected':''}`} data-status={agent.status} data-provider={agent.agent} data-unread={Boolean(agent.unread)} title={`${detail}${agent.unread?' · Unread':''}`} aria-label={`${title}: ${status}${agent.unread?', unread':''}`} onClick={()=>options.onAgentSelect(agent.id)}><span className="provider-mark">{['codex','claude','opencode','agy'].includes(agent.agent)?<img src={`/agents/${agent.agent}.svg`} alt=""/>:<Icon name="terminal" icon={options.icon}/>}<span className="agent-state">{agent.status==='working'?'⠏':agent.status==='blocked'||agent.status==='error'||agent.status==='failed'?'!':agent.status==='done'?'✓':''}</span></span><span className="terminal-agent-content"><strong>{title}</strong><span className="agent-meta">{detail}</span></span>{agent.unread&&<span className="session-unread" aria-hidden="true"/>}</button>;})}</div>
 </div>)}</div></section>;
}
function WorkspaceSidebar({state,options}:{state:State;options:Options}){
 return <>{state.projects.filter(project=>!project.parentId).map(project=>{const contexts=[project,...state.projects.filter(child=>child.parentId===project.id)];return <WorkspaceCard key={project.id} project={project} contexts={contexts} currentProjectId={state.currentProjectId} agents={state.agents.filter(agent=>contexts.some(context=>context.id===agent.project))} diffs={state.diffs} options={options}/>;})}</>;
}
export function createWorkspaceSidebar(options:Options){
 const root=createRoot(document.querySelector('#projects')!);
 return {render(state:State){flushSync(()=>root.render(<WorkspaceSidebar state={state} options={options}/>));},dispose:()=>root.unmount()};
}
