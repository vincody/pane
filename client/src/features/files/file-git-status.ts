import type {GitChanges} from '../../../../shared/contracts.ts';

export type FileGitStatus='U'|'M'|'A'|'D'|'R'|'C'|'!'|'I';
const labels:Record<FileGitStatus,string>={U:'Untracked',M:'Modified',A:'Added',D:'Deleted',R:'Renamed',C:'Copied','!':'Conflict',I:'Ignored by .gitignore'};
export function gitStatus(code:string):FileGitStatus|null {
 if(code==='??')return 'U';
 if(code==='!!')return 'I';
 if(['DD','AU','UD','UA','DU','AA','UU'].includes(code))return '!';
 if(code.includes('D'))return 'D';
 if(code.includes('R'))return 'R';
 if(code.includes('C'))return 'C';
 if(code.includes('A'))return 'A';
 if(code.includes('M')||code.includes('T'))return 'M';
 return null;
}

export function createFileGitDecorations(tree:HTMLElement){
 let projectId:string|null=null;
 const files=new Map<string,FileGitStatus>(),folders=new Map<string,FileGitStatus>(),ignored=new Set<string>();
 const isIgnored=(path:string)=>{for(let current=path;current;current=current.includes('/')?current.slice(0,current.lastIndexOf('/')):''){if(ignored.has(current))return true;}return false;};
 const priority:Record<FileGitStatus,number>={I:0,'!':7,D:6,M:5,R:4,C:3,A:2,U:1};
 function decorate(button:HTMLElement){
  const path=button.dataset.path||'',folder=button.dataset.entryType==='directory';
  const state=button.dataset.project===projectId?(folder?folders:files).get(path):undefined;
  button.querySelector('.file-git-status')?.remove();delete button.dataset.gitStatus;delete button.dataset.gitIgnored;
  if(button.dataset.entryType==='link')return;
  button.title=path;
  if(!state&&button.dataset.project===projectId&&isIgnored(path)){
   button.dataset.gitIgnored='true';button.title=`${path} · ${labels.I}`;
   const marker=document.createElement('span');marker.className='file-git-status file-git-ignored';marker.setAttribute('aria-hidden','true');
   marker.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6a15 15 0 0 1-3 3.5M6.6 6.6A15 15 0 0 0 2.5 12C3.5 13.5 7 18 12 18c1.4 0 2.7-.4 3.8-.9"/></svg>';
   button.append(marker);return;
  }
  if(!state)return;
  button.dataset.gitStatus=state;
  const marker=document.createElement('span');marker.className='file-git-status';marker.setAttribute('aria-hidden','true');
  marker.textContent=folder?'●':state;
  button.title=`${path} · ${folder?'Contains changes':labels[state]}`;
  button.append(marker);
 }
 function update(id:string|null,data:GitChanges|null){
  projectId=id;files.clear();folders.clear();ignored.clear();
  if(data?.available)for(const [path,entry] of Object.entries(data.statuses||{})){
   const state=gitStatus(entry.code);if(!state)continue;if(state==='I'){ignored.add(path);continue;}files.set(path,state);
   const parts=path.split('/');parts.pop();
   while(parts.length){const folder=parts.join('/'),previous=folders.get(folder);if(!previous||priority[state]>priority[previous])folders.set(folder,state);parts.pop();}
  }
  for(const button of tree.querySelectorAll<HTMLElement>('.file-row'))decorate(button);
 }
 return {decorate,update};
}
