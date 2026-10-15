import type { Workspace, GitChanges, GitFileChange } from '../../../../shared/contracts.ts';
import { errorMessage, type Api, type NativeIcon } from '../../components/contracts.ts';
import {gitStatus} from './file-git-status.ts';
import {fileIcon} from './file-icons.ts';
export interface ChangesOptions { api: Api; icon:NativeIcon; getProject: ()=>Workspace | null; onOpenDiff: (project: Workspace,file: GitFileChange,revision?:string)=>void | Promise<void>; onError: (message: string)=>void; onStatuses?: (projectId:string|null,data:GitChanges|null)=>void }
export type ChangesController = ReturnType<typeof setupChanges>;
export function setupChanges({api,icon,getProject,onOpenDiff,onError,onStatuses}: ChangesOptions){
 const sidebar=document.querySelector<HTMLElement>('#files-sidebar')!,head=sidebar.querySelector<HTMLElement>('.files-head')!,tree=sidebar.querySelector<HTMLElement>('#tree')!,filter=sidebar.querySelector<HTMLElement>('.file-filter')!;
 const tabs=document.createElement('div');tabs.className='files-section-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Workspace files and changes');tabs.innerHTML='<button type="button" role="tab" aria-selected="true" aria-controls="tree" data-files-view="files">Files</button><button type="button" role="tab" aria-selected="false" aria-controls="changes-list" data-files-view="changes">Changes <span class="changes-count" hidden></span></button>';head.querySelector<HTMLElement>('span')!.replaceWith(tabs);
 const list=document.createElement('section');list.id='changes-list';list.className='changes-list';list.setAttribute('role','tabpanel');list.setAttribute('aria-label','Workspace changes');list.hidden=true;tree.after(list);
 let mode: 'files' | 'changes'='files',sequence=0,data: GitChanges | null=null,projectId: string | null=null,pendingProject: string | null=null;
 const collapsed=new Set<string>();
 function message(text: string){list.replaceChildren();const node=document.createElement('p');node.className='changes-message';node.textContent=text;list.append(node);}
 function draw(){
  const count=tabs.querySelector<HTMLElement>('.changes-count')!;count.textContent=String(data?.files?.length||0);count.hidden=!data?.available;
  if(!getProject()){message('Select a workspace to view changes.');return;}
  if(!data)return;
  if(!data.available){message('This workspace is not a Git repository.');return;}
  if(!data.files.length){message('No changes. Working tree is clean.');return;}
  list.replaceChildren();
  const statusFor=(file:GitFileChange)=>gitStatus(data?.statuses?.[file.path]?.code||'')||(file.untracked?'U':'M');
  const groups=[{id:'changes',name:'Changes',files:data.files.filter(file=>statusFor(file)!=='U')},{id:'untracked',name:'Untracked Files',files:data.files.filter(file=>statusFor(file)==='U')}];
  for(const group of groups){
   if(!group.files.length)continue;
   const section=document.createElement('details');section.className='changes-group';section.dataset.group=group.id;section.open=!collapsed.has(group.id);
   section.ontoggle=()=>{if(!section.isConnected)return;if(section.open)collapsed.delete(group.id);else collapsed.add(group.id);};
   const heading=document.createElement('summary');heading.className='changes-group-heading';heading.setAttribute('aria-label',`${group.name}: ${group.files.length} files`);
   const chevron=icon('chevron-right');chevron.classList.add('changes-group-chevron');
   const title=document.createElement('span');title.textContent=group.name;
   const count=document.createElement('span');count.className='changes-group-count';count.textContent=String(group.files.length);
   heading.append(chevron,title,count);section.append(heading);
   const rows=document.createElement('div');rows.className='changes-group-files';section.append(rows);
   for(const file of group.files){
   const button=document.createElement('button');button.type='button';button.className='changed-file';
   const status=statusFor(file);button.dataset.status=status;
   const mark=document.createElement('span');mark.className='change-status';mark.dataset.status=status;mark.textContent=status;
   const parts=file.path.split('/'),basename=parts.pop()||file.path;
   const copy=document.createElement('span');copy.className='changed-file-copy';
   const name=document.createElement('span');name.className='changed-file-name';name.textContent=basename;
   const directory=document.createElement('span');directory.className='changed-file-directory';directory.textContent=parts.join('/');directory.hidden=!parts.length;
   copy.append(name,directory);
   const stat=document.createElement('span');stat.className='changed-file-stat';
   if(file.binary){stat.textContent='Binary';}else{
    for(const [value,prefix,className] of [[file.added,'+','change-added'],[file.removed,'−','change-removed']] as const){
     if(!value)continue;const number=document.createElement('span');number.className=className;number.textContent=`${prefix}${value}`;stat.append(number);
    }
   }
   button.append(fileIcon(file.path,icon),copy,stat,mark);
   button.title=`${file.path}${file.binary?' · Binary or unsupported text diff':''}`;button.setAttribute('aria-label',`View diff: ${file.path}`);
   button.onclick=async()=>{const project=getProject();if(!project||project.id!==projectId)return;button.disabled=true;try{await onOpenDiff(project,file);}catch(error){onError(errorMessage(error,'Could not open diff.'));}finally{button.disabled=false;}};rows.append(button);
   }
   list.append(section);
  }
  if(data.truncated){const note=document.createElement('p');note.className='changes-message';note.textContent='Showing the first 200 changed files.';list.append(note);}
 }
 async function refresh(){
  const project=getProject();if(!project){sequence++;projectId=null;data=null;onStatuses?.(null,null);draw();return;}
  if(pendingProject===project.id)return;
  const stamp=++sequence;pendingProject=project.id;if(projectId!==project.id){data=null;projectId=project.id;tabs.querySelector<HTMLElement>('.changes-count')!.hidden=true;message('Loading changes…');}
  try{const result=await api<GitChanges>(`/api/changes?${new URLSearchParams({project:project.id})}`);if(stamp===sequence&&getProject()?.id===project.id){data=result;onStatuses?.(project.id,result);draw();}}
  catch(error){if(stamp===sequence){onStatuses?.(project.id,null);message(errorMessage(error,'Could not load changes. Use Refresh to retry.'));tabs.querySelector<HTMLElement>('.changes-count')!.hidden=true;}}
  finally{if(pendingProject===project.id)pendingProject=null;}
 }
 function select(next: 'files' | 'changes'){mode=next;tree.hidden=next!=='files';filter.hidden=next!=='files';list.hidden=next!=='changes';for(const button of tabs.querySelectorAll<HTMLButtonElement>('button'))button.setAttribute('aria-selected',String(button.dataset.filesView===next));if(next==='changes')void refresh();}
 for(const button of tabs.querySelectorAll<HTMLButtonElement>('button'))button.onclick=()=>select(button.dataset.filesView==='changes'?'changes':'files');
 tabs.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=mode==='files'?'changes':'files';select(next);tabs.querySelector<HTMLButtonElement>(`[data-files-view="${next}"]`)!.focus();};
 const refreshButton=sidebar.querySelector<HTMLButtonElement>('#refresh-files')!,refreshFiles=refreshButton.onclick;refreshButton.onclick=event=>{if(mode==='files')refreshFiles?.call(refreshButton,event);void refresh();};
 setInterval(()=>{if(!document.hidden&&!document.querySelector<HTMLElement>('#app')!.classList.contains('files-hidden'))void refresh();},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 return {refresh,projectChanged(){pendingProject=null;projectId=null;data=null;collapsed.clear();sequence++;onStatuses?.(getProject()?.id||null,null);void refresh();}};
}
