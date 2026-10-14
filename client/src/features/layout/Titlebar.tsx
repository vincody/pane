import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import type {Workspace} from '../../components/contracts';
interface Attention {status:string;open:()=>void}
interface Props {attention:Attention[];right:Element}
function Titlebar({attention,right}:Props){
 const blocked=attention.filter(item=>item.status==='blocked');
 return createPortal(<button type="button" className="titlebar-attention" hidden={!blocked.length} aria-label={blocked.length?`${blocked.length} sessions need your input`:'No sessions need input'} onClick={()=>blocked[0]?.open()}>{blocked.length?`${blocked.length} needs attention`:''}</button>,right);
}
export function setupTitlebar({getAttention}:{getProject:()=>Workspace|null;getAttention:()=>Attention[]}){
 const bar=document.querySelector('.topbar')!,tabs=document.querySelector<HTMLElement>('#unified-tabs')!,right=document.createElement('span');right.className='react-icon';document.querySelector('.topbar-right')!.prepend(right);
 const host=document.createElement('div');host.className='react-titlebar-host';bar.querySelector('#show-sidebar')!.after(host);const root=createRoot(host);
 bar.querySelector('.toolbar-actions')!.before(tabs);tabs.classList.add('titlebar-tabs');tabs.setAttribute('aria-label','Open views');
 let scheduled=0;
 function refresh(){scheduled=0;
   tabs.hidden=false;
   root.render(<Titlebar attention={getAttention()} right={right}/>);
 }
 const queueRefresh=()=>{if(!scheduled)scheduled=requestAnimationFrame(refresh);};
 const observer=new MutationObserver(queueRefresh);observer.observe(tabs,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-selected']});
 document.addEventListener('pane-layout-changed',queueRefresh);flushSync(refresh);
 return {refresh,dispose(){observer.disconnect();document.removeEventListener('pane-layout-changed',queueRefresh);cancelAnimationFrame(scheduled);root.unmount();host.remove();right.remove();}};
}
