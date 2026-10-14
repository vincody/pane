import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import type {Workspace} from './contracts';
interface Attention {status:string;open:()=>void}
interface Props {project:Workspace|null;name:string;single:boolean;selected:HTMLElement|undefined;attention:Attention[];right:Element}
function Titlebar({project,name,single,selected,attention,right}:Props){
 const blocked=attention.filter(item=>item.status==='blocked');
 return <><nav className="titlebar-trail" aria-label="Current workspace and view"><span className="titlebar-workspace" title={project?.name||'Pane'}>{project?.name||'Pane'}</span><span className="titlebar-chevron" aria-hidden="true" hidden={!project?.branch}>›</span><span className="titlebar-branch" title={project?.branch||''} hidden={!project?.branch}>{project?.branch||''}</span><span className="titlebar-chevron" aria-hidden="true" hidden={!name}>›</span><span className="titlebar-focus" title={name} hidden={!name}>{name}</span><button type="button" className="titlebar-close icon-button" aria-label="Close current tab" title="Close current tab" hidden={!single||!selected} onClick={()=>selected?.querySelector<HTMLButtonElement>('.tab-close,.terminal-tab-close')?.click()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></nav>
 {createPortal(<button type="button" className="titlebar-attention" hidden={!blocked.length} aria-label={blocked.length?`${blocked.length} sessions need your input`:'No sessions need input'} onClick={()=>blocked[0]?.open()}>{blocked.length?`${blocked.length} needs attention`:''}</button>,right)}</>;
}
export function setupTitlebar({getProject,getAttention}:{getProject:()=>Workspace|null;getAttention:()=>Attention[]}){
 const bar=document.querySelector('.topbar')!,tabs=document.querySelector<HTMLElement>('#unified-tabs')!,right=document.createElement('span');right.className='react-icon';document.querySelector('.topbar-right')!.prepend(right);
 const host=document.createElement('div');host.className='react-titlebar-host';bar.querySelector('#show-sidebar')!.after(host);const root=createRoot(host);
 bar.after(tabs);tabs.classList.add('titlebar-tabs');tabs.setAttribute('aria-label','Open views');
 let scheduled=0;
 function refresh(){scheduled=0;const entries=[...tabs.querySelectorAll<HTMLElement>('[role="tab"]')],selected=entries.find(tab=>tab.getAttribute('aria-selected')==='true');tabs.hidden=entries.length<2;
   root.render(<Titlebar project={getProject()} name={selected?.querySelector('.tab-name,.terminal-tab-label,.ai-tab-name')?.textContent||''} single={entries.length===1} selected={selected} attention={getAttention()} right={right}/>);
 }
 const observer=new MutationObserver(()=>{if(!scheduled)scheduled=requestAnimationFrame(refresh);});observer.observe(tabs,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-selected']});flushSync(refresh);
 return {refresh,dispose(){observer.disconnect();cancelAnimationFrame(scheduled);root.unmount();host.remove();right.remove();}};
}
