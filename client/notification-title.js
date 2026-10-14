export function notificationTitle(agent) {
  const raw=agent.display_agent || agent.name || agent.terminal_title_stripped || '';
  const name=raw
    .replace(/\[[^\]]*action[\s_-]+required[^\]]*\]/gi,'')
    .replace(/(?:\[\s*!\s*\]|[!⚠])?\s*action[\s_-]+required\s*[:|–—-]?/gi,'')
    .replace(/^[\s|:–—-]+|[\s|:–—-]+$/g,'').trim();
  return name || (agent.agent ? agent.agent.charAt(0).toUpperCase()+agent.agent.slice(1) : 'Session');
}
