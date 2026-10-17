import type {TerminalAgent} from '../../components/contracts.ts';

export const needsAttention=(agent:TerminalAgent)=>agent.status==='blocked'||agent.status==='error'||agent.status==='failed'||Boolean(agent.unread);
export type WorkspaceLead='failed'|'blocked'|'working'|'review'|'idle';
/** One status for a workspace row; the most urgent session wins. */
export function workspaceLead(agents:readonly TerminalAgent[]):WorkspaceLead{
 if(agents.some(agent=>agent.status==='error'||agent.status==='failed'))return 'failed';
 if(agents.some(agent=>agent.status==='blocked'))return 'blocked';
 if(agents.some(agent=>agent.status==='working'))return 'working';
 return agents.some(agent=>agent.unread)?'review':'idle';
}
/** A session whose agent has exited is a plain shell again, so a finished turn no longer keeps it marked as done. */
export function createSessionAttention(){
 const states=new Map<string,{status:string;unread:boolean;completed:boolean}>();
 return {update(agents:readonly TerminalAgent[],viewing=true):TerminalAgent[]{
  const ids=new Set(agents.map(agent=>agent.id));for(const id of states.keys())if(!ids.has(id))states.delete(id);
  return agents.map(agent=>{
   const old=states.get(agent.id),completion=Boolean(agent.completed&&!old?.completed);
   const status=agent.status==='working'||agent.status==='blocked'||agent.status==='error'||agent.status==='failed'?agent.status:completion?'done':old?.status==='done'&&agent.agent!=='shell'?'done':agent.status;
   const changed=old?.status!==status;
   let unread=status==='working'?false:Boolean(old?.unread||changed&&['blocked','error','failed','done'].includes(status));
   if(agent.selected&&viewing)unread=false;
   states.set(agent.id,{status,unread,completed:Boolean(agent.completed)});
   return {...agent,status,unread};
  });
 }};
}
export function nextAttention(agents:readonly TerminalAgent[],afterId?:string){
 const start=agents.findIndex(agent=>agent.id===afterId);
 for(let offset=1;offset<=agents.length;offset++){const candidate=agents[(start+offset)%agents.length];if(needsAttention(candidate))return candidate;}
 return undefined;
}
