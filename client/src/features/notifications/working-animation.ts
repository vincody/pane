export function startWorkingAnimation(){
 const frames=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'],reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const tick=()=>{if(document.hidden)return;const frame=reduced.matches?'⠏':frames[Math.floor(performance.now()/100)%frames.length];for(const node of document.querySelectorAll<HTMLElement>('.agent-card[data-status=working] .agent-state,.ai-session-tab[data-status=working] .ai-tab-indicator,.terminal-pane-header[data-status=working] .terminal-pane-state'))if(node.textContent!==frame)node.textContent=frame;};
 setInterval(tick,100);document.addEventListener('visibilitychange',tick);reduced.addEventListener('change',tick);tick();
}
