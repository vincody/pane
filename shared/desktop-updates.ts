export interface DesktopUpdateState {
 version:string;
 platform:string;
 supported:boolean;
 automatic:boolean;
 status:'unsupported'|'idle'|'checking'|'current'|'available'|'downloading'|'downloaded'|'waiting'|'installing'|'error';
 latestVersion:string|null;
 releaseNotes:string;
 progress:number;
 checkedAt:string|null;
 message:string;
}
