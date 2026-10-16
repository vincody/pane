export const MIN_TERMINAL_FONT_SIZE=8;
export const MAX_TERMINAL_FONT_SIZE=32;
export const DEFAULT_TERMINAL_FONT_SIZE=13;
const STORAGE_KEY='ai-web.terminal-font-size';

// Whole pixels within a range xterm lays out reliably; anything else keeps the fallback.
export function normalizeTerminalFontSize(value:unknown,fallback=DEFAULT_TERMINAL_FONT_SIZE){
 const size=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;
 return Number.isFinite(size)?Math.min(MAX_TERMINAL_FONT_SIZE,Math.max(MIN_TERMINAL_FONT_SIZE,Math.round(size))):fallback;
}
export function readTerminalFontSize(){try{return normalizeTerminalFontSize(localStorage.getItem(STORAGE_KEY));}catch{return DEFAULT_TERMINAL_FONT_SIZE;}}
export function saveTerminalFontSize(size:number){try{localStorage.setItem(STORAGE_KEY,String(size));}catch{}}
