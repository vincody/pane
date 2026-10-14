function normalized(value) {
  let result = String(value || '').replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  if (/^[a-z]:/i.test(result) || result.startsWith('//')) result = result.toLowerCase();
  return result;
}
export function projectForAgent(projects, agent) {
  const cwd = normalized(agent.foreground_cwd || agent.cwd);
  if (!agent.foreground_cwd && !agent.cwd) return null;
  return projects.filter(project => {
    const root = normalized(project.root);
    return cwd === root || cwd.startsWith(root === '/' ? root : root + '/');
  }).sort((a, b) => normalized(b.root).length - normalized(a.root).length)[0] || null;
}
export function groupAgents(projects, agents) {
  const groups = new Map(projects.map(project => [project.id, []]));
  const owners = new Map();
  const assigned = new Map();
  for (const agent of agents) {
    const project = projectForAgent(projects, agent);
    if (!project) continue;
    assigned.set(agent, project.id);
    if (agent.workspace_id) {
      if (!owners.has(agent.workspace_id)) owners.set(agent.workspace_id, new Set());
      owners.get(agent.workspace_id).add(project.id);
    }
  }
  const unmatched = [];
  for (const agent of agents) {
    const peers = owners.get(agent.workspace_id);
    const id = assigned.get(agent) || ((!agent.cwd && !agent.foreground_cwd && peers?.size === 1) ? peers.values().next().value : null);
    if (id) groups.get(id).push(agent); else unmatched.push(agent);
  }
  return { groups, unmatched };
}

export function workspaceTree(projects, agents) {
 const {groups}=groupAgents(projects,agents);
 return {folders:projects.slice(),groups};
}
