import type {GitCommitFile} from '../../../../shared/contracts.ts';
export type CommitTreeNode={kind:'file';name:string;file:GitCommitFile}|{kind:'directory';name:string;path:string;children:CommitTreeNode[]};
interface Directory {name:string;path:string;directories:Map<string,Directory>;files:GitCommitFile[]}
export function commitFileTree(files:readonly GitCommitFile[]):CommitTreeNode[]{
 const root:Directory={name:'',path:'',directories:new Map(),files:[]};
 for(const file of files){const parts=file.path.split('/');parts.pop();let parent=root;
  for(const name of parts){let next=parent.directories.get(name);if(!next){next={name,path:parent.path?`${parent.path}/${name}`:name,directories:new Map(),files:[]};parent.directories.set(name,next);}parent=next;}
  parent.files.push(file);
 }
 function children(parent:Directory):CommitTreeNode[]{
  const directories=[...parent.directories.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(directory=>{
   let current=directory,name=current.name;
   while(!current.files.length&&current.directories.size===1){current=[...current.directories.values()][0];name+=`/${current.name}`;}
   return {kind:'directory' as const,name,path:current.path,children:children(current)};
  });
  const leaves=parent.files.map(file=>({kind:'file' as const,name:file.path.split('/').at(-1)!,file})).sort((a,b)=>a.name.localeCompare(b.name));
  return [...directories,...leaves];
 }
 return children(root);
}
