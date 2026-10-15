import {useEffect,useLayoutEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {Icon, NativeSlot} from '../../components/bridge';
import type {Api,NativeIcon} from '../../components/contracts';
import {Integrations} from './Integrations.tsx';

interface Category {id:string; name:string; description:string; icon:string; controls:string[]; nodes:Node[]}
function Settings({categories,close,footnote,icon,api}: {categories:Category[]; close:Node[]; footnote:Node[]; icon:NativeIcon;api:Api}) {
  const [current,setCurrent]=useState('appearance'),content=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  useEffect(()=>{const dialog=document.querySelector<HTMLDialogElement>('#settings-dialog')!;const update=()=>setOpen(dialog.open);const observer=new MutationObserver(update);observer.observe(dialog,{attributes:true,attributeFilter:['open']});update();return ()=>observer.disconnect();},[]);
  const category=categories.find(item=>item.id===current)!;
  useLayoutEffect(()=>{if(content.current)content.current.scrollTop=0;},[current]);
  return <><aside className="settings-navigation"><h2>Settings</h2><nav aria-label="Settings categories" onKeyDown={event=>{
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next].click();buttons[next].focus();
  }}>{categories.map(item=><button key={item.id} type="button" data-settings-page={item.id} className={current===item.id?'active':''} aria-current={current===item.id?'page':undefined} onClick={()=>setCurrent(item.id)}><Icon name={item.icon} icon={icon}/>{item.name}</button>)}</nav></aside>
  <section className="settings-main"><header className="settings-header"><h2 id="settings-page-title">{category.name}</h2><NativeSlot nodes={close}/></header><div className="settings-content" ref={content} aria-labelledby="settings-page-title">
    {categories.map(item=><section key={item.id} data-settings-panel={item.id} hidden={current!==item.id}><p className="settings-page-description">{item.description}</p><div className={`settings-card${item.id==='keybinds'?' keybinds-card':''}`}>{item.id==='integrations'?<Integrations api={api} active={open&&current===item.id}/>:<NativeSlot nodes={item.nodes}/>}</div></section>)}
    <NativeSlot nodes={footnote}/>
  </div></section></>;
}
export function setupSettings({icon,api}: {icon:NativeIcon;api:Api}) {
  const dialog=document.querySelector<HTMLDialogElement>('#settings-dialog')!,close=dialog.querySelector('.close-dialog')!,footnote=dialog.querySelector('.settings-footnote')!;
  const categories:Category[]=[
    {id:'appearance',name:'Appearance',description:'Make your workspace comfortable.',icon:'settings',controls:['[aria-label="Color theme"]','#compact-setting'],nodes:[]},
    {id:'editor',name:'Editor',description:'Choose how files open and how code is displayed.',icon:'code',controls:['#font-setting','#wrap-setting','[aria-label="Opening files"]','[aria-label="Default file view"]'],nodes:[]},
    {id:'terminal',name:'Terminal',description:'Choose how new terminal sessions are arranged.',icon:'monitor',controls:['#terminal-setting','#auto-split-terminal-setting'],nodes:[]},
    {id:'usage',name:'Usage',description:'Keep account limits within reach.',icon:'chart',controls:['[aria-label="Show usage"]','[aria-label="Show Codex usage"]','[aria-label="Show Claude usage"]','[aria-label="Usage quota window"]'],nodes:[]},
    {id:'notifications',name:'Notifications',description:'Stay informed when agents need you.',icon:'bell',controls:['[aria-label="Popup notifications"]','[aria-label="Notification sounds"]','#test-notification','[aria-label="Notify while focused"]'],nodes:[]},
    {id:'integrations',name:'Integrations',description:'Check the tools and accounts used to connect your workspace.',icon:'branch',controls:[],nodes:[]},
    {id:'keybinds',name:'Keybinds',description:'Keyboard shortcuts for navigating your workspace and editing files.',icon:'code',controls:[],nodes:[]}
  ];
  for(const category of categories)for(const selector of category.controls){const row=dialog.querySelector(selector)?.closest('.setting-row');if(row)category.nodes.push(row);}
  const shortcuts=document.querySelector('#help-dialog .shortcut-list');if(shortcuts)categories.find(item=>item.id==='keybinds')!.nodes.push(shortcuts);
  document.querySelector('#help-dialog')?.remove();document.querySelector('#help')?.remove();
  dialog.replaceChildren();dialog.setAttribute('aria-label','Settings');
  const root=createRoot(dialog);flushSync(()=>root.render(<Settings categories={categories} close={[close]} footnote={[footnote]} icon={icon} api={api}/>));
  return {dispose:()=>root.unmount()};
}
