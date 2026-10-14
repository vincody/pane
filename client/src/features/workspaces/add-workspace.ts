import type {Api,NativeIcon,Workspace} from '../../components/contracts.ts';

export function createAddWorkspaceDialog({api,icon,onManual,onCreated}:{api:Api;icon:NativeIcon;onManual:()=>void;onCreated:(project:Workspace)=>Promise<void>}){
 const dialog=document.createElement('dialog');dialog.id='add-workspace-dialog';dialog.setAttribute('aria-labelledby','add-workspace-title');
 dialog.innerHTML='<header class="dialog-heading"><span id="add-workspace-title">Add a workspace</span><button type="button" class="icon-button" aria-label="Close add workspace">×</button></header><section class="workspace-add-choices"><button type="button" class="workspace-add-card" data-add="browse"><span class="workspace-add-icon"></span><span><strong>Browse folder</strong><small>Open a local project, Git repository or folder</small></span></button><p class="workspace-add-caption">Other ways to add</p><div class="workspace-add-alternatives"><button type="button" class="workspace-add-card" data-add="clone"><span class="workspace-add-icon"></span><span><strong>Clone from URL</strong><small>Clone a remote Git repository</small></span></button><button type="button" class="workspace-add-card" data-add="create"><span class="workspace-add-icon"></span><span><strong>Create new project</strong><small>Start with an empty Git repository</small></span></button></div><button type="button" class="workspace-add-manual">Enter a folder path manually</button></section><form class="workspace-add-form" hidden><label class="workspace-clone-url">Repository URL<input name="url" aria-label="Repository URL" placeholder="https://github.com/owner/repository.git" autocomplete="off"></label><label>Project name<input name="name" aria-label="Project name" maxlength="80" placeholder="my-project" required></label><label>Location<div class="folder-path-row"><input name="parent" aria-label="Project parent folder" placeholder="Choose a parent folder" required><button type="button" class="secondary-button workspace-pick-parent">Browse…</button></div></label><p class="workspace-location-preview"></p><div class="dialog-actions"><button type="button" class="secondary-button workspace-add-back">Back</button><button type="submit" class="primary-button">Create project</button></div></form><p class="form-error" role="alert"></p>';
 document.body.append(dialog);
 const choices=dialog.querySelector<HTMLElement>('section')!,form=dialog.querySelector<HTMLFormElement>('form')!,error=dialog.querySelector<HTMLElement>('.form-error')!,title=dialog.querySelector<HTMLElement>('#add-workspace-title')!;
 const name=form.querySelector<HTMLInputElement>('[name=name]')!,parent=form.querySelector<HTMLInputElement>('[name=parent]')!,url=form.querySelector<HTMLInputElement>('[name=url]')!,submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;
 let mode:'create'|'clone'='create',busy=false,nameEdited=false,defaultParent='',openGeneration=0;
 for(const [kind,mark] of [['browse','folder'],['clone','globe'],['create','plus']])dialog.querySelector(`[data-add=${kind}] .workspace-add-icon`)!.append(icon(mark));
 function setBusy(value:boolean){busy=value;for(const control of dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input'))control.disabled=value;dialog.setAttribute('aria-busy',String(value));}
 function preview(){const root=parent.value.trim(),separator=root.includes('\\')?'\\':'/';form.querySelector<HTMLElement>('.workspace-location-preview')!.textContent=root&&name.value.trim()?`${root.replace(/[\\/]+$/,'')}${separator}${name.value.trim()}`:'';}
 function start(){title.textContent='Add a workspace';choices.hidden=false;form.hidden=true;error.textContent='';}
 async function finish(project:Workspace){await onCreated(project);setBusy(false);dialog.close();}
 const browse=dialog.querySelector<HTMLButtonElement>('[data-add=browse]')!;
 browse.onclick=async()=>{
  setBusy(true);error.textContent='';
  try{const selected=await api<{path:string|null}>('/api/select-workspace-folder',{method:'POST'});if(selected.path)await finish(await api<Workspace>('/api/projects',{method:'POST',body:JSON.stringify({path:selected.path})}));}
  catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not open the folder.';}finally{setBusy(false);}
 };
 for(const kind of ['clone','create'] as const)dialog.querySelector<HTMLButtonElement>(`[data-add=${kind}]`)!.onclick=()=>{
  mode=kind;form.reset();parent.value=defaultParent;nameEdited=false;error.textContent='';choices.hidden=true;form.hidden=false;title.textContent=kind==='clone'?'Clone from URL':'Create new project';
  form.querySelector<HTMLElement>('.workspace-clone-url')!.hidden=kind!=='clone';url.required=kind==='clone';submit.textContent=kind==='clone'?'Clone repository':'Create project';preview();(kind==='clone'?url:name).focus();
 };
 url.oninput=()=>{if(!nameEdited){const last=url.value.trim().replace(/\/$/,'').split(/[/:]/).at(-1)||'';name.value=last.replace(/\.git$/,'');preview();}};
 name.oninput=()=>{nameEdited=true;preview();};parent.oninput=preview;
 form.querySelector<HTMLButtonElement>('.workspace-pick-parent')!.onclick=async()=>{
  setBusy(true);error.textContent='';try{const selected=await api<{path:string|null}>('/api/select-workspace-folder',{method:'POST'});if(selected.path){parent.value=selected.path;preview();}}catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not choose a folder.';}finally{setBusy(false);}
 };
 form.onsubmit=event=>{event.preventDefault();if(busy)return;void(async()=>{
  setBusy(true);error.textContent='';submit.textContent=mode==='clone'?'Cloning…':'Creating…';
  try{await finish(await api<Workspace>('/api/create-project',{method:'POST',body:JSON.stringify({mode,name:name.value.trim(),parent:parent.value.trim(),...(mode==='clone'?{url:url.value.trim()}:{})})}));}
  catch(failure){error.textContent=failure instanceof Error?failure.message:'Could not create the project.';}
  finally{setBusy(false);submit.textContent=mode==='clone'?'Clone repository':'Create project';}
 })();};
 dialog.querySelector<HTMLButtonElement>('.workspace-add-back')!.onclick=start;
 dialog.querySelector<HTMLButtonElement>('.workspace-add-manual')!.onclick=()=>{dialog.close();onManual();};
 dialog.querySelector<HTMLButtonElement>('[aria-label="Close add workspace"]')!.onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=event=>{if(busy)event.preventDefault();};
 return {open(){if(busy)return;start();if(!dialog.open)dialog.showModal();browse.focus();const request=++openGeneration;void api<{parent:string}>('/api/project-defaults').then(data=>{if(request!==openGeneration||!dialog.open)return;defaultParent=data.parent;if(!form.hidden&&!parent.value){parent.value=defaultParent;preview();}}).catch(()=>{});}};
}
