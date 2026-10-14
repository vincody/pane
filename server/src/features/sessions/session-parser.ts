import { toolActions, resultState, executionHandles, polledExecutions, commandOutput, appendCommandOutput } from '../agents/agent-actions.ts';
import type { ToolAction, ActionStatus } from '../agents/agent-actions.ts';
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value !== null && typeof value === 'object' ? value as JsonRecord : {};
const string = (value: unknown): string | null => typeof value === 'string' ? value : null;
export interface SessionMetadata { model?: string | null; effort?: string | null; access?: string | null; approval?: string | null; configuredModel?: string | null; configuredEffort?: string | null; startedAt?: string | null; turnId?: string | null }
export interface SessionAction extends ToolAction { id: string; role: 'assistant'; kind: 'action'; phase: 'activity'; turnId: string | null; status: ActionStatus }
export interface TranscriptMessage { id: string; role: 'user' | 'assistant'; kind?: undefined; text: string; phase: string | null; turnId: string | null; model: string | null; elapsedMs: number | null }
export interface ParsedSession { messages: (SessionAction | TranscriptMessage)[]; metadata: SessionMetadata }
export function parseSession(text: string, provider: string): ParsedSession {
  const messages: (SessionAction | TranscriptMessage)[] = []; const calls = new Map<unknown, SessionAction[]>(), executions = new Map<string, SessionAction[]>(); let metadata: SessionMetadata = {}, startedAt: string | null = null, turnId: string | null = null;
  for (const line of text.split('\n')) {
    try {
      const row = record(JSON.parse(line)); const payload = record(row.payload);
      if (provider === 'codex' && row.type === 'turn_context') {
        metadata = { ...metadata, model: string(payload.model), effort: string(payload.effort), access: string(record(payload.sandbox_policy).type), approval: string(payload.approval_policy) };
        turnId = string(payload.turn_id) || turnId;
      }
      if (provider === 'codex' && row.type === 'event_msg' && payload.type === 'task_started') { startedAt = string(row.timestamp); turnId = string(payload.turn_id) || turnId; }
      if(provider==='codex'&&row.type==='event_msg'&&payload.type==='thread_settings_applied'){const settings=record(payload.thread_settings);metadata.configuredModel=string(settings.model);metadata.configuredEffort=string(settings.reasoning_effort);}
      const addActions=(callId: unknown,name: unknown,input: unknown)=>{
        const actions=toolActions(name,input).map((action,index): SessionAction=>({id:`${callId}:${index}`,role:'assistant',kind:'action',phase:'activity',turnId,...action,target:action.target.slice(0,16000),status:'running'}));
        const pending=polledExecutions(name,input).flatMap(handle=>executions.get(handle)||[]);
        const linked=[...new Set([...actions,...pending])];if(linked.length)calls.set(callId,linked);
        if(actions.length)messages.push(...actions);
      };
      if(provider==='codex'&&row.type==='response_item') {
        if(['function_call','custom_tool_call'].includes(string(payload.type) || ''))addActions(payload.call_id || payload.id,payload.name,payload.arguments || payload.input);
        if(['function_call_output','custom_tool_call_output'].includes(string(payload.type) || '')){const actions=calls.get(payload.call_id)||[];const output=commandOutput(payload.output),scope=actions.filter(action=>action.action==='run').length>1?'batch':'command';for(const action of actions){action.status=resultState(payload.output);appendCommandOutput(action,output,scope);}for(const handle of executionHandles(payload.output))if(actions.length)executions.set(handle,actions);}
      }
      const rawMessage=record(row.message);
      if(provider==='claude'&&Array.isArray(rawMessage.content)) {
        for(const rawBlock of rawMessage.content){const block=record(rawBlock);
          if(block.type==='tool_use')addActions(block.id,block.name,block.input);
          if(block.type==='tool_result'){for(const action of calls.get(block.tool_use_id)||[]){action.status=block.is_error?'failed':resultState(block.content);appendCommandOutput(action,commandOutput(block.content));}}
        }
      }
      const item = provider === 'codex' ? (row.type === 'response_item' ? payload : null) : rawMessage;
      if (!item || (provider === 'codex' && item.type !== 'message')) continue;
      if ((item.role !== 'user' && item.role !== 'assistant') || item.phase === 'analysis') continue;
      const content = typeof item.content === 'string' ? item.content : (Array.isArray(item.content) ? item.content : []).map(record).filter(part => ['text','input_text','output_text'].includes(string(part.type) || '')).map(part => string(part.text) || '').join('\n');
      if (!content.trim() || /^(<environment_context>|<user_instructions>|<permissions instructions>|<system-reminder>)/.test(content.trim())) continue;
      if (provider === 'claude') { if(string(item.model))metadata.model=string(item.model);if(item.role==='user')startedAt=string(row.timestamp); }
      const timestamp=string(row.timestamp);
      const elapsed = startedAt && timestamp ? Math.max(0, Date.parse(timestamp)-Date.parse(startedAt)) : null;
      messages.push({ id: string(item.id) || `${timestamp || ''}:${messages.length}`, role: item.role, text: content, phase: string(item.phase), turnId, model:metadata.model || null, elapsedMs:Number.isFinite(elapsed)?elapsed:null });
    } catch {}
  }
  return { messages: messages.slice(-80), metadata: { ...metadata, startedAt, turnId } };
}
export function parseTranscript(text: string, provider: string): TranscriptMessage[] { return parseSession(text,provider).messages.filter((message): message is TranscriptMessage=>message.kind!=='action'); }
