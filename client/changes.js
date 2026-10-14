export function setupChanges({api,getProject,onOpenDiff,onError}){
 const sidebar=document.querySelector('#files-sidebar'),head=sidebar.querySelector('.files-head'),tree=sidebar.querySelector('#tree'),filter=sidebar.querySelector('.file-filter');
 const tabs=document.createElement('div');tabs.className='files-section-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Workspace files and changes');tabs.innerHTML='<button type="button" role="tab" aria-selected="true" aria-controls="tree" data-files-view="files">Files</button><button type="button" role="tab" aria-selected="false" aria-controls="changes-list" data-files-view="changes">Changes <span class="changes-count" hidden></span></button>';head.querySelector('span').replaceWith(tabs);
 const list=document.createElement('section');list.id='changes-list';list.className='changes-list';list.setAttribute('role','tabpanel');list.setAttribute('aria-label','Workspace changes');list.hidden=true;tree.after(list);
 let mode='files',sequence=0,data=null,projectId=null,pendingProject=null;
 function message(text){list.replaceChildren();const node=document.createElement('p');node.className='changes-message';node.textContent=text;list.append(node);}
 function draw(){
  const count=tabs.querySelector('.changes-count');count.textContent=String(data?.files?.length||0);count.hidden=!data?.available;
  if(!getProject()){message('Select a workspace to view changes.');return;}
  if(!data)return;
  if(!data.available){message('This workspace is not a Git repository.');return;}
  if(!data.files.length){message('No changes. Working tree is clean.');return;}
  list.replaceChildren();
  for(const file of data.files){
   const button=document.createElement('button');button.type='button';button.className='changed-file';
   const code=data.statuses?.[file.path]?.code||'',status=code==='??'?'?':/[R]/.test(code)?'R':/A/.test(code)||file.untracked?'A':/D/.test(code)?'D':'M';
   const mark=document.createElement('span');mark.className='change-status';mark.dataset.status=status;mark.textContent=status;
   const name=document.createElement('span');name.className='changed-file-name';name.textContent=file.path;name.title=file.path;
   const stat=document.createElement('span');stat.className='changed-file-stat';stat.textContent=file.binary?'Binary':`+${file.added??0} −${file.removed??0}`;button.append(mark,name,stat);
   button.title=`${file.path}${file.binary?' · Binary or unsupported text diff':''}`;button.setAttribute('aria-label',`View diff: ${file.path}`);
   button.onclick=async()=>{const project=getProject();if(!project||project.id!==projectId)return;button.disabled=true;try{await onOpenDiff(project,file);}catch(error){onError(error.message);}finally{button.disabled=false;}};list.append(button);
  }
  if(data.truncated){const note=document.createElement('p');note.className='changes-message';note.textContent='Showing the first 200 changed files.';list.append(note);}
 }
 async function refresh(){
  const project=getProject();if(!project){sequence++;projectId=null;data=null;draw();return;}
  if(pendingProject===project.id)return;
  const stamp=++sequence;pendingProject=project.id;if(projectId!==project.id){data=null;projectId=project.id;tabs.querySelector('.changes-count').hidden=true;message('Loading changes…');}
  try{const result=await api(`/api/changes?${new URLSearchParams({project:project.id})}`);if(stamp===sequence&&getProject()?.id===project.id){data=result;draw();}}
  catch(error){if(stamp===sequence){message(error.message||'Could not load changes. Use Refresh to retry.');tabs.querySelector('.changes-count').hidden=true;}}
  finally{if(pendingProject===project.id)pendingProject=null;}
 }
 function select(next){mode=next;tree.hidden=next!=='files';filter.hidden=next!=='files';list.hidden=next!=='changes';for(const button of tabs.querySelectorAll('button'))button.setAttribute('aria-selected',String(button.dataset.filesView===next));if(next==='changes')void refresh();}
 for(const button of tabs.querySelectorAll('button'))button.onclick=()=>select(button.dataset.filesView);
 tabs.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=mode==='files'?'changes':'files';select(next);tabs.querySelector(`[data-files-view="${next}"]`).focus();};
 const refreshButton=sidebar.querySelector('#refresh-files'),refreshFiles=refreshButton.onclick;refreshButton.onclick=()=>mode==='changes'?void refresh():refreshFiles?.();
 setInterval(()=>{if(mode==='changes'&&!document.hidden&&!document.querySelector('#app').classList.contains('files-hidden'))void refresh();},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='changes')void refresh();});
 return {refresh,projectChanged(){pendingProject=null;projectId=null;data=null;sequence++;void refresh();}};
}
