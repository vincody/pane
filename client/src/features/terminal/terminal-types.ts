import type {SavedConversation} from './terminal-journal.ts';
import type {Terminal} from '@xterm/xterm';
import type {FitAddon} from '@xterm/addon-fit';
import type {Workspace,SessionRecord,SshConnection} from '../../../../shared/contracts.ts';
import type {PaneTree} from './terminal-layout.ts';
import type {TerminalActivity} from './terminal-activity.ts';
export interface ExternalFilePane {id:string;project:Workspace;element:HTMLElement;paneHeader:HTMLElement;paneZoom:HTMLButtonElement;layout?:()=>void;onSelect?:()=>void;}
export interface TerminalSnapshot {id:string;project:string;agent:string;name:string;status:string;completed:boolean;selected:boolean;}
export interface TerminalViewOptions {token:string;icon:(name:string)=>SVGElement;onClose?:(visible:boolean)=>void;onSessionsChange?:(sessions:TerminalSnapshot[])=>void;onSelect?:()=>void;onOpenBrowser?:(project:Workspace)=>void;onOpenLink?:(url:string,project:Workspace)=>void;onLocalAddress?:(url:string,project:Workspace)=>void;onNotice?:(message:string,duration?:number)=>void;}
export interface PaneGroup {root:PaneTree<PaneSession>|null;manual?:boolean;}
export interface PaneSession extends ExternalFilePane {startedAt?:number;number?:number;savedConversation?:SavedConversation;autoResume?:()=>void;restorePending?:boolean;reconnect?:()=>void;replaying?:boolean;agentEnded?:boolean;serverId?:string;ssh?:SshConnection;disposed?:boolean;reconnectTimer?:ReturnType<typeof setTimeout>;retries?:number;external?:boolean;name:string;shell:string;state:string;launch:string;lastUsed:number;group:PaneGroup;ready?:boolean;socket?:WebSocket|null;terminal?:Terminal;fit?:FitAddon;paneTitle?:HTMLElement;paneMark?:HTMLElement;paneProvider?:string|null;tab?:HTMLDivElement;renameInput?:HTMLInputElement|null;customName?:boolean;resume?:SessionRecord|null;cliTitle?:string;activityTitle?:string;agent?:string|null;agentStatus?:string;activity?:TerminalActivity;activityTimer?:ReturnType<typeof setTimeout>|null;turnSubmitted?:boolean;inputDraft?:string;observer?:ResizeObserver;paneAnimation?:Animation;}

