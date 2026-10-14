import type {GitChanges} from '../shared/contracts.ts';

export type FileGitStatus='U'|'M'|'A'|'D'|'R'|'C'|'!';
const labels:Record<FileGitStatus,string>={U:'Untracked',M:'Modified',A:'Added',D:'Deleted',R:'Renamed',C:'Copied','!':'Conflict'};
export function gitStatus(code:string):FileGitStatus|null {
 if(code==='??')return 'U';
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
 const files=new Map<string,FileGitStatus>(),folders=new Map<string,FileGitStatus>();
 const priority:Record<FileGitStatus,number>={'!':7,D:6,M:5,R:4,C:3,A:2,U:1};
 function decorate(button:HTMLElement){
  const path=button.dataset.path||'',folder=button.dataset.entryType==='directory';
  const state=button.dataset.project===projectId?(folder?folders:files).get(path):undefined;
  button.querySelector('.file-git-status')?.remove();delete button.dataset.gitStatus;
  if(button.dataset.entryType==='link')return;
  button.title=path;
  if(!state)return;
  button.dataset.gitStatus=state;
  const marker=document.createElement('span');marker.className='file-git-status';marker.setAttribute('aria-hidden','true');
  marker.textContent=folder?'●':state;
  button.title=`${path} · ${folder?'Contains changes':labels[state]}`;
  button.append(marker);
 }
 function update(id:string|null,data:GitChanges|null){
  projectId=id;files.clear();folders.clear();
  if(data?.available)for(const [path,entry] of Object.entries(data.statuses||{})){
   const state=gitStatus(entry.code);if(!state)continue;files.set(path,state);
   const parts=path.split('/');parts.pop();
   while(parts.length){const folder=parts.join('/'),previous=folders.get(folder);if(!previous||priority[state]>priority[previous])folders.set(folder,state);parts.pop();}
  }
  for(const button of tree.querySelectorAll<HTMLElement>('.file-row'))decorate(button);
 }
 return {decorate,update};
}
