import type {Terminal} from '@xterm/xterm';
import type {ClipboardPaste} from '../../../../shared/desktop-clipboard.ts';
export interface PasteKey {type:string;ctrlKey:boolean;shiftKey:boolean;altKey:boolean;metaKey:boolean;code:string}

// xterm.js turns Ctrl+V into ^V and cancels the browser paste, so the shortcut is handled here instead.
export function isPasteShortcut(event:PasteKey,platform=window.paneDesktop?.platform||'win32'){
 if(event.type!=='keydown'||event.altKey)return false;
 if(platform==='darwin')return event.metaKey&&!event.ctrlKey&&!event.shiftKey&&event.code==='KeyV';
 if(event.metaKey)return false;
 if(event.shiftKey&&!event.ctrlKey)return event.code==='Insert';
 return event.ctrlKey&&event.code==='KeyV';
}

// An embedded ESC (such as a pasted ESC[201~) would end the bracketed paste early and run the rest as keystrokes.
export const sanitizePasteText=(text:string)=>text.replace(/\x1b/g,'␛');
const quotePath=(file:string)=>/\s/.test(file)?`"${file}"`:file;

export function terminalPasteText(content:ClipboardPaste){
 if(content.kind==='text')return sanitizePasteText(content.text);
 if(content.kind==='files')return sanitizePasteText(content.paths.map(quotePath).join(' '));
 if(content.kind==='image')return sanitizePasteText(quotePath(content.path));
 return '';
}

// Images are pasted as the path of a temp PNG, which agent CLIs attach as an image.
export async function pasteIntoTerminal(terminal:Pick<Terminal,'paste'>,read:(()=>Promise<ClipboardPaste>)|undefined,onNotice?:(message:string)=>void){
 if(!read)return;
 let content:ClipboardPaste;
 try{content=await read();}catch{onNotice?.('Could not read the clipboard.');return;}
 if(content.kind==='error'){onNotice?.(content.message);return;}
 const text=terminalPasteText(content);
 if(text)terminal.paste(text);
}
