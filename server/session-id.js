import crypto from 'node:crypto';
export const sessionId = agent => crypto.createHash('sha256').update(`${agent.agent}:${agent.agent_session?.value || agent.terminal_id || agent.pane_id}`).digest('hex').slice(0,24);
