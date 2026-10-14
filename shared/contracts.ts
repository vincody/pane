export type Provider='claude'|'codex';
export interface Workspace {id:string;name:string;root:string;branch?:string|null}
export interface SessionRecord {id:string;agent:Provider;agent_session:{value:string};cwd:string;name:string;createdAt?:string;updatedAt:string;last_update?:string;local?:boolean;live?:boolean;archived?:boolean;file?:string;root?:string;newSession?:boolean}
export interface AgentSnapshot {
 id?:string;agent:string;name?:string;display_agent?:string;terminal_title_stripped?:string;cwd?:string;foreground_cwd?:string;workspace_id?:string;agent_session?:{value:string};pane_id?:string;terminal_id?:string;saved_session_id?:string;archived?:boolean;local?:boolean;
 agent_status?:string;status?:string;sessionConnection?:string;externalWorking?:boolean;sessionInUse?:boolean;sessionMessage?:string;externalStartedAt?:string|null;canStop?:boolean;inputLocked?:boolean;terminalSession?:boolean;completed?:boolean;
}
export interface SessionSnapshot {agents:AgentSnapshot[];sessions:SessionRecord[];connected?:boolean;source?:string;workspaces?:Workspace[]}
export interface Limit {usedPercent:number;resetsAt?:string|null}
export interface AccountQuota {provider:Provider;available:boolean;fiveHour?:Limit|null;weekly?:Limit|null;message?:string;stale?:boolean;updatedAt?:string|null}
export interface GitFileChange {path:string;added:number|null;removed:number|null;binary:boolean;untracked?:boolean}
export interface GitChanges {available:boolean;files:GitFileChange[];baseline?:string|null;statuses?:Record<string,{code:string;originalPath?:string}>;truncated?:boolean}
export interface FileDiff {path:string;original:string;modified:string;baseline:string|null}
export interface TextFile {kind:'text';content:string;version:string;bom:boolean;size:number}
export interface ImageFile {kind:'image';size:number;path:string}
export interface TreeEntry {name:string;path:string;type:'file'|'directory'|'link';image:boolean}
export type TerminalClientMessage={type:'start';project:string;cols:number;rows:number}|{type:'input';data:string}|{type:'resize';cols:number;rows:number};
export type TerminalServerMessage={type:'ready';shell:string;project:string}|{type:'data';data:string}|{type:'agent';agent:string|null}|{type:'error';message:string}|{type:'exit';exitCode:number;signal?:number};
