export type FileAction='create-file'|'create-folder'|'rename'|'duplicate'|'trash'|'reveal';
export interface FileActionResult {path:string}
export interface FileActionCapabilities {trash:boolean;reveal:boolean}
