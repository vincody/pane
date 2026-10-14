export interface LifecycleState {known:boolean;status:'idle'|'working'|'done';turnId:string|null;startedAt:string|null}
export const emptyActivity=():LifecycleState=>({known:false,status:'idle',turnId:null,startedAt:null});
export function applyLifecycle(state:LifecycleState,row:unknown):LifecycleState{
 if(!row||typeof row!=='object'||!('type' in row)||row.type!=='event_msg')return state;
 const record=row as {payload?:unknown;timestamp?:unknown};if(!record.payload||typeof record.payload!=='object')return state;
 const event=record.payload as {type?:unknown;turn_id?:unknown},type=typeof event.type==='string'?event.type:'';
 const turnId=typeof event.turn_id==='string'?event.turn_id:null;
 if(type==='task_started')return {known:true,status:'working',turnId,startedAt:typeof record.timestamp==='string'?record.timestamp:null};
 if(!['task_complete','task_completed','turn_aborted','task_stopped'].includes(type))return state;
 if(turnId&&state.turnId&&turnId!==state.turnId)return state;
 return {...state,known:true,status:['task_complete','task_completed'].includes(type)?'done':'idle',turnId:turnId || state.turnId};
}
