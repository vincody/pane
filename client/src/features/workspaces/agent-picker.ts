const items=[{value:'shell',name:'Blank terminal',icon:'terminal'},{value:'claude',name:'Claude Code',icon:'claude'},{value:'codex',name:'Codex',icon:'codex'},{value:'none',name:'No session',icon:'none'}];
const mark=(icon:string)=>['claude','codex'].includes(icon)?`<img src="/agents/${icon}.svg" alt="">`:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icon==='terminal'?'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>':'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>'}</svg>`;

/** A real DOM menu, independent of customizable native select support. */
export function attachAgentPicker(select:HTMLSelectElement){
 select.hidden=true;select.removeAttribute('aria-label');select.setAttribute('aria-hidden','true');select.tabIndex=-1;
 const button=document.createElement('button');button.type='button';button.className='worktree-agent-trigger';button.id='worktree-agent-trigger';button.setAttribute('role','combobox');button.setAttribute('aria-label','Worktree agent');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
 const menu=document.createElement('div');menu.className='worktree-agent-menu';menu.id='worktree-agent-options';menu.setAttribute('popover','auto');menu.setAttribute('role','listbox');menu.setAttribute('aria-label','Agents');button.setAttribute('aria-controls',menu.id);
 select.after(button,menu);
 let active=0;
 const options=items.map((item,index)=>{
  const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.id=`worktree-agent-${item.value}`;option.setAttribute('role','option');option.setAttribute('aria-label',item.name);option.innerHTML=`${mark(item.icon)}<span>${item.name}</span><span class="agent-check" aria-hidden="true">✓</span>`;
  option.onpointermove=()=>highlight(index);option.onmousedown=event=>event.preventDefault();option.onclick=()=>choose(index);menu.append(option);return option;
 });
 function highlight(index:number){active=(index+items.length)%items.length;options.forEach((option,i)=>option.dataset.active=String(i===active));button.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});}
 function refresh(){
  const item=items.find(item=>item.value===select.value)||items[0];
  button.innerHTML=`${mark(item.icon)}<span>${item.name}</span><svg class="agent-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>`;
  button.disabled=select.disabled;options.forEach((option,i)=>option.setAttribute('aria-selected',String(items[i].value===item.value)));
  if(select.disabled)close();
 }
 function close(){if(menu.matches(':popover-open'))menu.hidePopover();button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');}
 function position(){const rect=button.getBoundingClientRect();menu.style.width=`${Math.min(rect.width,innerWidth-24)}px`;menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-menu.offsetWidth-12))}px`;const height=menu.offsetHeight;menu.style.top=`${rect.bottom+height+6<=innerHeight-12?rect.bottom+6:Math.max(12,rect.top-height-6)}px`;}
 function open(){if(button.disabled)return;menu.showPopover();button.setAttribute('aria-expanded','true');position();highlight(Math.max(0,items.findIndex(item=>item.value===select.value)));}
 function choose(index:number){select.value=items[index].value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close();button.focus();}
 button.onclick=()=>menu.matches(':popover-open')?close():open();
 button.onkeydown=event=>{
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const wasOpen=menu.matches(':popover-open');if(!wasOpen)open();highlight(event.key==='Home'?0:event.key==='End'?items.length-1:active+(wasOpen?(event.key==='ArrowDown'?1:-1):0));}
  else if(['Enter',' '].includes(event.key)){event.preventDefault();if(menu.matches(':popover-open'))choose(active);else open();}
  else if(event.key==='Escape'&&menu.matches(':popover-open')){event.preventDefault();event.stopPropagation();close();}
  else if(event.key==='Tab')close();
 };
 menu.addEventListener('toggle',()=>{if(!menu.matches(':popover-open')){button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');}});
 select.addEventListener('change',refresh);select.form?.addEventListener('reset',()=>queueMicrotask(refresh));
 new MutationObserver(refresh).observe(select,{attributes:true,attributeFilter:['disabled']});
 select.closest('dialog')?.addEventListener('close',close);
 window.addEventListener('resize',()=>{if(menu.matches(':popover-open'))position();});
 refresh();return {refresh};
}
