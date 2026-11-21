/** Where Claude sessions and plain shells open. The terminal forms are the original behaviour, kept as a choice. */
export type ClaudeMode='chat'|'terminal';
export type ShellMode='dock'|'main';
const CLAUDE_KEY='ai-web.claude-mode',SHELL_KEY='ai-web.shell-mode';
export const readClaudeMode=():ClaudeMode=>{try{return localStorage.getItem(CLAUDE_KEY)==='terminal'?'terminal':'chat';}catch{return 'chat';}};
export const readShellMode=():ShellMode=>{try{return localStorage.getItem(SHELL_KEY)==='main'?'main':'dock';}catch{return 'dock';}};
export const saveClaudeMode=(mode:ClaudeMode)=>{try{localStorage.setItem(CLAUDE_KEY,mode);}catch{}};
export const saveShellMode=(mode:ShellMode)=>{try{localStorage.setItem(SHELL_KEY,mode);}catch{}};
