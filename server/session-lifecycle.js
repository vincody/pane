export const emptyActivity=()=>({known:false,status:'idle',turnId:null,startedAt:null});
export function applyLifecycle(state,row){
 if(row.type!=='event_msg')return state;const event=row.payload || {},type=event.type;
 if(type==='task_started')return {known:true,status:'working',turnId:event.turn_id || null,startedAt:row.timestamp || null};
 if(!['task_complete','task_completed','turn_aborted','task_stopped'].includes(type))return state;
 if(event.turn_id&&state.turnId&&event.turn_id!==state.turnId)return state;
 return {...state,known:true,status:['task_complete','task_completed'].includes(type)?'done':'idle',turnId:event.turn_id || state.turnId};
}
