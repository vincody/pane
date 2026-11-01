/** Which desk each agent owns and where it should be. Pure, so it can be tested without a canvas. */
export interface LoungeAgent {id:string;agent:string;name:string;status:string;project:string}
export type Zone='desk'|'lounge';
export type Bubble='alert'|'error'|'done'|null;
export interface Placement {id:string;zone:Zone;slot:number;bubble:Bubble}
export interface Slot {zone:Zone;slot:number}

/** Every agent owns one desk for as long as it exists; its monitor keeps showing how it last left things. */
export const DESK_SLOTS=8;

const WORKING=new Set(['working','connecting']);
const ALERT=new Set(['blocked']);
const ERROR=new Set(['error','failed']);

/** Agents that are working, or waiting on the user, sit at a desk; everything else rests in the lounge. */
export function zoneOf(status:string):Zone{return WORKING.has(status)||ALERT.has(status)||ERROR.has(status)?'desk':'lounge';}
export function bubbleOf(status:string):Bubble{return ALERT.has(status)?'alert':ERROR.has(status)?'error':null;}

export const STATUS_LABEL:Record<string,string>={working:'working',connecting:'starting',blocked:'needs you',error:'error',failed:'failed',done:'finished',idle:'resting'};
export const statusLabel=(status:string)=>STATUS_LABEL[status]||'resting';

/**
 * Gives every agent a desk. An agent keeps its desk for as long as it exists, whatever it is doing, so a desk never
 * changes hands because someone went for coffee. `zone` says where the agent should be right now: at its desk while
 * it works or waits on the user, free to roam otherwise. Agents beyond the number of desks are counted in `hidden`.
 */
export function layoutAgents(agents:LoungeAgent[],previous:ReadonlyMap<string,Slot>=new Map()):{placed:Placement[];hidden:number}{
 const taken=new Set<number>(),desks=new Map<string,number>();
 const ordered=[...agents].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 for(const agent of ordered){
  const before=previous.get(agent.id);
  if(before&&before.slot<DESK_SLOTS&&!taken.has(before.slot)){taken.add(before.slot);desks.set(agent.id,before.slot);}
 }
 let hidden=0;
 for(const agent of ordered){
  if(desks.has(agent.id))continue;
  let slot=0;while(slot<DESK_SLOTS&&taken.has(slot))slot++;
  if(slot>=DESK_SLOTS){hidden++;continue;}
  taken.add(slot);desks.set(agent.id,slot);
 }
 const placed=ordered.flatMap(agent=>{const slot=desks.get(agent.id);return slot===undefined?[]:[{id:agent.id,zone:zoneOf(agent.status),slot,bubble:bubbleOf(agent.status)}];});
 return {placed,hidden};
}

/** Short summary for the panel header and the canvas label. */
export function summarize(agents:LoungeAgent[]):string{
 const working=agents.filter(a=>WORKING.has(a.status)).length,waiting=agents.filter(a=>ALERT.has(a.status)||ERROR.has(a.status)).length,resting=agents.length-working-waiting;
 return [working&&`${working} working`,waiting&&`${waiting} waiting`,resting&&`${resting} idle`].filter(Boolean).join(' · ');
}
