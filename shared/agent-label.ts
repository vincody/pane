const labels:Record<string,string>={agy:'Antigravity'};
/** Display name of an agent CLI: the product name where the command differs from it (agy → Antigravity), otherwise the capitalised command. */
export function agentLabel(agent:string):string {return labels[agent]||agent.charAt(0).toUpperCase()+agent.slice(1);}
