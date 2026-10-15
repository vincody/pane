import type {GitHubItem,Workspace} from '../../../../shared/contracts.ts';

export interface GitHubList {items:GitHubItem[];limited:boolean}
export const githubListKey=(project:Pick<Workspace,'id'|'root'>,kind:string,state:string)=>JSON.stringify([project.id,project.root,kind,state]);
export function createGitHubListCache({now=Date.now,ttl=30_000,max=32}={}){
 const entries=new Map<string,{data:GitHubList;at:number}>();
 let generation=0;
 return {
  generation:()=>generation,
  get(key:string){const entry=entries.get(key);if(!entry)return;entries.delete(key);entries.set(key,entry);return {data:entry.data,fresh:now()-entry.at<ttl};},
  set(key:string,data:GitHubList,expectedGeneration=generation){if(expectedGeneration!==generation)return;entries.delete(key);entries.set(key,{data,at:now()});while(entries.size>max)entries.delete(entries.keys().next().value!);},
  clear(){generation++;entries.clear();}
 };
}
export const githubLists=createGitHubListCache();
