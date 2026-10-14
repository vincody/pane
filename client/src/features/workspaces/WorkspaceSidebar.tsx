import {useLayoutEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Icon} from '../../components/bridge';
import type {NativeIcon,TerminalAgent,Workspace} from '../../components/contracts';
interface Options {
 icon:NativeIcon;
 onSelect:(project:Workspace)=>void;
 onAgentSelect:(id:string)=>void;
 onMenu:(project:Workspace,x:number,y:number,origin:HTMLElement)=>void;
 setupDrag:(project:Workspace,button:HTMLButtonElement,group:HTMLElement)=>void;
}
interface State {projects:Workspace[];currentProjectId:string|null;agents:TerminalAgent[]}
function WorkspaceCard({project,selected,agents,options}: {project:Workspace;selected:boolean;agents:TerminalAgent[];options:Options}){
 const group=useRef<HTMLElement>(null),button=useRef<HTMLButtonElement>(null);
 useLayoutEffect(()=>{options.setupDrag(project,button.current!,group.current!);},[project,options]);
 const attention=agents.filter(agent=>agent.status==='blocked').length;
 return <section ref={group} className={`workspace-group${selected?' selected':''}`} data-project={project.id}><div className="project-row">
  <button ref={button} className={`project-button${selected?' active':''}`} aria-current={selected?'page':undefined} title={project.root} onClick={()=>options.onSelect(project)} onContextMenu={event=>{event.preventDefault();options.onMenu(project,event.clientX,event.clientY,event.currentTarget);}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();options.onMenu(project,rect.left+20,rect.bottom,event.currentTarget);}}}><Icon name="folder" icon={options.icon}/><span className="project-text">{project.name}</span>{attention>0&&<span className="workspace-attention" title={`${attention} ${attention===1?'session requires':'sessions require'} your input or review`}>{attention} {attention===1?'needs':'need'} attention</span>}</button>
  <button className="project-more" aria-label={`Actions for ${project.name}`} aria-haspopup="menu" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();options.onMenu(project,rect.left,rect.bottom,event.currentTarget);}}><Icon name="more" icon={options.icon}/></button>
 </div>{(project.branch||agents.length>0)&&<div className="workspace-children">{project.branch&&<div className="workspace-branch" title={`Git branch: ${project.branch}`}><Icon name="branch" icon={options.icon}/><span>{project.branch}</span></div>}
  {agents.map(agent=>{const status=({working:'Working',blocked:'Needs your input',idle:'Ready'} as Record<string,string>)[agent.status]||agent.status,title=agent.name===project.name?agent.agent.charAt(0).toUpperCase()+agent.agent.slice(1):agent.name,detail=`${agent.agent} · ${status}`;return <button key={agent.id} type="button" className={`agent-card terminal-agent-card${agent.selected?' selected':''}`} data-status={agent.status} data-provider={agent.agent} title={detail} aria-label={`${title}: ${status}`} onClick={()=>options.onAgentSelect(agent.id)}><span className="provider-mark">{['codex','claude','opencode'].includes(agent.agent)?<img src={`/agents/${agent.agent}.svg`} alt=""/>:<Icon name="terminal" icon={options.icon}/>}<span className="agent-state">{agent.status==='working'?'⠏':agent.status==='blocked'?'!':''}</span></span><span className="terminal-agent-content"><strong>{title}</strong><span className="agent-meta">{detail}</span></span></button>;})}
 </div>}</section>;
}
function WorkspaceSidebar({state,options}:{state:State;options:Options}){
 return <>{state.projects.map(project=><WorkspaceCard key={project.id} project={project} selected={state.currentProjectId===project.id} agents={state.agents.filter(agent=>agent.project===project.id)} options={options}/>)}</>;
}
export function createWorkspaceSidebar(options:Options){
 const root=createRoot(document.querySelector('#projects')!);
 return {render(state:State){flushSync(()=>root.render(<WorkspaceSidebar state={state} options={options}/>));},dispose:()=>root.unmount()};
}
