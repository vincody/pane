import crypto from 'node:crypto';
export const sessionId = (agent:{agent:string;agent_session?:{value:string};terminal_id?:string;pane_id?:string}) => crypto.createHash('sha256').update(`${agent.agent}:${agent.agent_session?.value || agent.terminal_id || agent.pane_id}`).digest('hex').slice(0,24);
