import {agentLabel} from '../../../../shared/agent-label.ts';
import type {AgentSnapshot} from '../../../../shared/contracts.ts';
export function notificationTitle(agent:AgentSnapshot) {
  const raw=agent.display_agent || agent.name || agent.terminal_title_stripped || '';
  const name=raw
    .replace(/\[[^\]]*action[\s_-]+required[^\]]*\]/gi,'')
    .replace(/(?:\[\s*!\s*\]|[!⚠])?\s*action[\s_-]+required\s*[:|–—-]?/gi,'')
    .replace(/^[\s|:–—-]+|[\s|:–—-]+$/g,'').trim();
  return name || (agent.agent ? agentLabel(agent.agent) : 'Session');
}
