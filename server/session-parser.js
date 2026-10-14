import { toolActions, resultState, executionHandles, polledExecutions, commandOutput, appendCommandOutput } from './agent-actions.js';
export function parseSession(text, provider) {
  const messages = []; const calls = new Map(), executions = new Map(); let metadata = {}, startedAt = null, turnId = null;
  for (const line of text.split('\n')) {
    try {
      const row = JSON.parse(line); const payload = row.payload || {};
      if (provider === 'codex' && row.type === 'turn_context') {
        metadata = { ...metadata, model: payload.model || null, effort: payload.effort || null, access: payload.sandbox_policy?.type || null, approval: payload.approval_policy || null };
        turnId = payload.turn_id || turnId;
      }
      if (provider === 'codex' && row.type === 'event_msg' && payload.type === 'task_started') { startedAt = row.timestamp || null; turnId = payload.turn_id || turnId; }
      if(provider==='codex'&&row.type==='event_msg'&&payload.type==='thread_settings_applied'){const settings=payload.thread_settings || {};metadata.configuredModel=settings.model || null;metadata.configuredEffort=settings.reasoning_effort || null;}
      const addActions=(callId,name,input)=>{
        const actions=toolActions(name,input).map((action,index)=>({id:`${callId}:${index}`,role:'assistant',kind:'action',phase:'activity',turnId,...action,target:action.target.slice(0,16000),status:'running'}));
        const pending=polledExecutions(name,input).flatMap(handle=>executions.get(handle)||[]);
        const linked=[...new Set([...actions,...pending])];if(linked.length)calls.set(callId,linked);
        if(actions.length)messages.push(...actions);
      };
      if(provider==='codex'&&row.type==='response_item') {
        if(['function_call','custom_tool_call'].includes(payload.type))addActions(payload.call_id || payload.id,payload.name,payload.arguments || payload.input);
        if(['function_call_output','custom_tool_call_output'].includes(payload.type)){const actions=calls.get(payload.call_id)||[];const output=commandOutput(payload.output),scope=actions.filter(action=>action.action==='run').length>1?'batch':'command';for(const action of actions){action.status=resultState(payload.output);appendCommandOutput(action,output,scope);}for(const handle of executionHandles(payload.output))if(actions.length)executions.set(handle,actions);}
      }
      if(provider==='claude'&&Array.isArray(row.message?.content)) {
        for(const block of row.message.content){
          if(block.type==='tool_use')addActions(block.id,block.name,block.input);
          if(block.type==='tool_result'){for(const action of calls.get(block.tool_use_id)||[]){action.status=block.is_error?'failed':resultState(block.content);appendCommandOutput(action,commandOutput(block.content));}}
        }
      }
      const item = provider === 'codex' ? (row.type === 'response_item' ? payload : null) : row.message;
      if (!item || (provider === 'codex' && item.type !== 'message')) continue;
      if (!['user', 'assistant'].includes(item.role) || item.phase === 'analysis') continue;
      const content = typeof item.content === 'string' ? item.content : (item.content || []).filter(part => ['text','input_text','output_text'].includes(part.type)).map(part => part.text || '').join('\n');
      if (!content.trim() || /^(<environment_context>|<user_instructions>|<permissions instructions>|<system-reminder>)/.test(content.trim())) continue;
      if (provider === 'claude') { if(item.model)metadata.model=item.model;if(item.role==='user')startedAt=row.timestamp || null; }
      const elapsed = startedAt && row.timestamp ? Math.max(0, Date.parse(row.timestamp)-Date.parse(startedAt)) : null;
      messages.push({ id: item.id || `${row.timestamp || ''}:${messages.length}`, role: item.role, text: content, phase: item.phase || null, turnId, model:metadata.model || null, elapsedMs:Number.isFinite(elapsed)?elapsed:null });
    } catch {}
  }
  return { messages: messages.slice(-80), metadata: { ...metadata, startedAt, turnId } };
}
export function parseTranscript(text, provider) { return parseSession(text,provider).messages.filter(message=>message.kind!=='action'); }
