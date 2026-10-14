export function setupTitlebar({getProject,getAttention}){
 const bar=document.querySelector('.topbar'),tabs=document.querySelector('#unified-tabs');
 const trail=document.createElement('nav');trail.className='titlebar-trail';trail.setAttribute('aria-label','Current workspace and view');
 const workspace=document.createElement('span'),branch=document.createElement('span'),focus=document.createElement('span');
 workspace.className='titlebar-workspace';branch.className='titlebar-branch';focus.className='titlebar-focus';
 const separator=()=>{const node=document.createElement('span');node.className='titlebar-chevron';node.textContent='›';node.setAttribute('aria-hidden','true');return node;};
 const branchSeparator=separator(),focusSeparator=separator();
 const close=document.createElement('button');close.className='titlebar-close icon-button';close.type='button';close.setAttribute('aria-label','Close current tab');close.title='Close current tab';close.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
 trail.append(workspace,branchSeparator,branch,focusSeparator,focus,close);bar.querySelector('#show-sidebar').after(trail);
 const attention=document.createElement('button');attention.className='titlebar-attention';attention.type='button';attention.hidden=true;bar.querySelector('.topbar-right').prepend(attention);
 bar.after(tabs);tabs.classList.add('titlebar-tabs');tabs.setAttribute('aria-label','Open views');
 let scheduled=false,selected;
 close.onclick=()=>selected?.querySelector('.tab-close,.terminal-tab-close')?.click();
 attention.onclick=()=>{const item=getAttention().find(item=>item.status==='blocked');if(item)item.open();};
 function refresh(){
  scheduled=false;
  const entries=[...tabs.querySelectorAll('[role="tab"]')];selected=entries.find(tab=>tab.getAttribute('aria-selected')==='true');
  tabs.hidden=entries.length<2;
  const project=getProject(),name=selected?.querySelector('.tab-name,.terminal-tab-label,.ai-tab-name')?.textContent||'';
  const set=(node,value)=>{if(node.textContent!==value)node.textContent=value;node.title=value;node.hidden=!value;};
  set(workspace,project?.name||'Pane');set(branch,project?.branch||'');set(focus,name);
  branchSeparator.hidden=!project?.branch;focusSeparator.hidden=!name;close.hidden=entries.length!==1||!selected;
  const blocked=getAttention().filter(item=>item.status==='blocked');attention.hidden=!blocked.length;
  set(attention,blocked.length?`${blocked.length} needs attention`:'');attention.setAttribute('aria-label',blocked.length?`${blocked.length} sessions need your input`:'No sessions need input');
 }
 const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}});observer.observe(tabs,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-selected']});
 refresh();return {refresh};
}
