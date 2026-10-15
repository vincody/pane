import type {Api,NativeIcon,Workspace} from '../../components/contracts.ts';
import type {FileAction,FileActionCapabilities,FileActionResult} from '../../../../shared/file-actions.ts';
import './file-actions.css';

interface Target {project:Workspace;path:string;type:string;row:HTMLElement|null}
interface Options {tree:HTMLElement;api:Api;icon:NativeIcon;getProject:()=>Workspace|null;guard:(project:string,path:string)=>void;changed:(project:string,action:FileAction,before:string,after:string)=>Promise<void>;toast:(message:string)=>void}
export function setupFileActions(options:Options){
 const {tree,api,icon,toast}=options;
 const menu=document.createElement('div');menu.className='context-menu file-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','File actions');menu.hidden=true;document.body.append(menu);
 const dialog=document.createElement('dialog');dialog.className='file-action-dialog';dialog.setAttribute('aria-labelledby','file-action-title');
 dialog.innerHTML='<form><h2 id="file-action-title"></h2><p class="file-action-detail"></p><label class="file-action-name">Name<input name="name" aria-label="Name" autocomplete="off" spellcheck="false" maxlength="200"></label><p class="file-action-error" role="alert"></p><footer><button type="button" class="secondary-button">Cancel</button><button type="submit" class="primary-button"></button></footer></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form')!,heading=dialog.querySelector('h2')!,detail=dialog.querySelector<HTMLElement>('.file-action-detail')!,nameRow=dialog.querySelector<HTMLElement>('.file-action-name')!,input=dialog.querySelector('input')!,error=dialog.querySelector<HTMLElement>('.file-action-error')!,cancel=dialog.querySelector<HTMLButtonElement>('[type=button]')!,submit=dialog.querySelector<HTMLButtonElement>('[type=submit]')!;
 let origin:HTMLElement|null=null,request:{target:Target;action:FileAction}|null=null,pending=false;
 const capabilities=api<FileActionCapabilities>('/api/file-actions').catch(()=>({trash:false,reveal:false}));
 const parent=(file:string)=>file.includes('/')?file.slice(0,file.lastIndexOf('/')):'';
 const basename=(file:string)=>file.split('/').pop()||'';
 function closeMenu(restore=false){menu.hidden=true;origin?.classList.remove('file-context-target');if(restore)origin?.focus();}
 function guard(target:Target,action:FileAction){if(['rename','trash','duplicate'].includes(action))options.guard(target.project.id,target.path);}
 async function perform(target:Target,action:FileAction,name?:string){
  guard(target,action);
  const result=await api<FileActionResult>(`/api/file-actions?${new URLSearchParams({project:target.project.id})}`,{method:'POST',body:JSON.stringify({action,path:target.path,...(name!==undefined?{name}:{})})});
  if(action!=='reveal')await options.changed(target.project.id,action,target.path,result.path);
  return result;
 }
 function showDialog(target:Target,action:FileAction){
  try{guard(target,action);}catch(cause){toast(cause instanceof Error?cause.message:'Could not change this file.');return;}
  request={target,action};error.textContent='';input.value=action==='rename'?basename(target.path):'';
  const trash=action==='trash';nameRow.hidden=trash;input.required=!trash;
  heading.textContent=trash?'Move to Recycle Bin?':action==='rename'?'Rename':action==='create-folder'?'New folder':'New file';
  detail.textContent=trash?`“${basename(target.path)}”${target.type==='directory'?' and its contents':''} will be moved to the Recycle Bin. You can restore it from there.`:`${target.project.name}${target.path?` / ${target.path}`:' /'}`;
  submit.textContent=trash?'Move to Recycle Bin':action==='rename'?'Rename':'Create';submit.classList.toggle('file-action-danger',trash);dialog.showModal();
  if(trash)cancel.focus();else{input.focus();const dot=input.value.lastIndexOf('.');input.setSelectionRange(0,dot>0&&target.type==='file'?dot:input.value.length);}
 }
 cancel.onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});dialog.addEventListener('close',()=>{request=null;origin?.focus();});
 form.onsubmit=async event=>{
  event.preventDefault();if(!request||pending)return;pending=true;submit.disabled=true;cancel.disabled=true;input.disabled=true;dialog.setAttribute('aria-busy','true');error.textContent='';
  try{const {target,action}=request;await perform(target,action,action==='trash'?undefined:input.value.trim());dialog.close();toast(action==='trash'?'Moved to Recycle Bin':action==='rename'?'Renamed':action==='create-folder'?'Folder created':'File created');}
  catch(cause){error.textContent=cause instanceof Error?cause.message:'Could not complete this action.';}
  finally{pending=false;submit.disabled=false;cancel.disabled=false;input.disabled=false;dialog.removeAttribute('aria-busy');}
 };
 async function open(event:MouseEvent|KeyboardEvent){
  const project=options.getProject();if(!project)return;
  const element=event.target instanceof Element?event.target:null,row=element?.closest<HTMLElement>('.file-row')||null;
  if(row?.dataset.project!==project.id&&row)return;
  event.preventDefault();event.stopPropagation();closeMenu();origin=row||tree;
  const target:Target={project,path:row?.dataset.path||'',type:row?.dataset.entryType||'directory',row};
  const location:Target=target.type==='directory'?target:{...target,path:parent(target.path),type:'directory'};
  const available=await capabilities;if(options.getProject()?.id!==project.id)return;
  menu.replaceChildren();
  const add=(label:string,mark:string,run:()=>void|Promise<unknown>,disabled=false,hint='')=>{
   const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.disabled=disabled;if(hint)button.title=hint;button.append(icon(mark));const text=document.createElement('span');text.textContent=label;button.append(text);
   button.onclick=()=>{closeMenu();void Promise.resolve().then(run).catch(cause=>toast(cause instanceof Error?cause.message:'Could not complete this action.'));};menu.append(button);return button;
  };
  const separator=()=>{const line=document.createElement('div');line.setAttribute('role','separator');menu.append(line);};
  add('New File','file-plus',()=>showDialog(location,'create-file'));add('New Folder','folder-plus',()=>showDialog(location,'create-folder'));separator();
  const separatorChar=project.root.includes('\\')?'\\':'/';const absolute=project.root.replace(/[\\/]$/,'')+(target.path?separatorChar+target.path.replaceAll('/',separatorChar):'');
  add('Copy Path','copy',async()=>{await navigator.clipboard.writeText(absolute);toast('Path copied');});
  add('Copy Relative Path','copy',async()=>{await navigator.clipboard.writeText(target.path||'.');toast('Relative path copied');});
  if(target.path)add('Duplicate','copy',async()=>{await perform(target,'duplicate');toast('Duplicate created');},target.type==='link');
  add('Reveal in File Explorer','arrow',()=>perform(target,'reveal'),!available.reveal,!available.reveal?'Available in the desktop app':'');
  if(target.path){separator();add('Rename','rename',()=>showDialog(target,'rename'),target.type==='link');const remove=add('Delete','trash',()=>showDialog(target,'trash'),!available.trash||target.type==='link',!available.trash?'Recycle Bin requires the desktop app':'Move to Recycle Bin');remove.className='file-action-danger';}
  menu.hidden=false;row?.classList.add('file-context-target');const rect=menu.getBoundingClientRect(),anchor=row?.getBoundingClientRect()||tree.getBoundingClientRect();
  const x='clientX'in event&&event.clientX?event.clientX:anchor.left+20,y='clientY'in event&&event.clientY?event.clientY:anchor.top+20;
  menu.style.left=`${Math.max(8,Math.min(x,innerWidth-rect.width-8))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-rect.height-8))}px`;menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 }
 tree.addEventListener('contextmenu',event=>{void open(event);});
 tree.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')void open(event);});
 menu.onkeydown=event=>{
  if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();closeMenu(true);return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
 };
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target as Node))closeMenu();},true);
 document.addEventListener('contextmenu',event=>{if(!tree.contains(event.target as Node))closeMenu();});
 window.addEventListener('resize',()=>closeMenu());window.addEventListener('blur',()=>closeMenu());tree.addEventListener('scroll',()=>closeMenu());
}
