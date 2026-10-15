import type {GitCommit} from '../../../../shared/contracts.ts';
export interface GraphSegment {from:number;to:number;color:number}
export interface GraphRow {lane:number;color:number;segments:GraphSegment[]}
// Trace pending ancestry through each topological row. A merge adds a lane;
// lanes converge when another descendant already points at the same parent.
export function graphRows(commits:readonly GitCommit[]):{rows:GraphRow[];width:number}{
 let pending:{hash:string;color:number}[]=[],nextColor=0,width=1;
 const rows:GraphRow[]=[];
 for(const commit of commits){
  let lane=pending.findIndex(item=>item.hash===commit.hash);
  if(lane<0){lane=pending.length;pending.push({hash:commit.hash,color:nextColor++});}
  const before=[...pending],color=before[lane].color;
  pending.splice(lane,1);
  for(let index=0;index<commit.parents.length;index++){
   const hash=commit.parents[index];if(pending.some(item=>item.hash===hash))continue;
   pending.splice(Math.min(lane+index,pending.length),0,{hash,color:index===0?color:nextColor++});
  }
  const segments:GraphSegment[]=[];
  before.forEach((item,from)=>{if(from===lane)return;const to=pending.findIndex(next=>next.hash===item.hash);if(to>=0)segments.push({from,to,color:item.color});});
  for(const parent of commit.parents){const to=pending.findIndex(item=>item.hash===parent);if(to>=0)segments.push({from:lane,to,color:pending[to].color});}
  width=Math.max(width,before.length,pending.length);rows.push({lane,color,segments});
 }
 return {rows,width};
}
