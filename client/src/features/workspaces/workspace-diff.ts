import type {Api} from '../../components/contracts.ts';
import type {GitChanges} from '../../../../shared/contracts.ts';
export interface DiffStat {added:number;removed:number}
const STALE_MS=30_000,PARALLEL=3;
export const sumChanges=(changes:GitChanges):DiffStat=>changes.available?changes.files.reduce((total,file)=>({added:total.added+(file.added||0),removed:total.removed+(file.removed||0)}),{added:0,removed:0}):{added:0,removed:0};
/** Keeps per-workspace +/- totals fresh without refetching on every sidebar render. */
export function createWorkspaceDiffs(api:Api,onChange:()=>void){
 const stats=new Map<string,DiffStat>(),fetched=new Map<string,number>(),queue:string[]=[];let running=0;
 async function load(id:string){
  try{
   const next=sumChanges(await api<GitChanges>(`/api/changes?${new URLSearchParams({project:id})}`)),old=stats.get(id);
   stats.set(id,next);if((old?.added||0)!==next.added||(old?.removed||0)!==next.removed)onChange();
  }catch{}
 }
 function pump(){while(running<PARALLEL&&queue.length){const id=queue.shift()!;running++;void load(id).finally(()=>{running--;pump();});}}
 return {
  stats:():ReadonlyMap<string,DiffStat>=>stats,
  refresh(ids:readonly string[]){
   const known=new Set(ids);for(const id of [...stats.keys()])if(!known.has(id)){stats.delete(id);fetched.delete(id);}
   const now=Date.now();for(const id of ids)if(!queue.includes(id)&&now-(fetched.get(id)||0)>=STALE_MS){fetched.set(id,now);queue.push(id);}
   pump();
  }
 };
}
