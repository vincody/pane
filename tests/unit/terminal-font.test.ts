import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTerminalFontSize,DEFAULT_TERMINAL_FONT_SIZE,MAX_TERMINAL_FONT_SIZE,MIN_TERMINAL_FONT_SIZE} from '../../client/src/features/terminal/terminal-font.ts';

test('terminal text size is whole pixels within the supported range',()=>{
 assert.equal(normalizeTerminalFontSize('16'),16);
 assert.equal(normalizeTerminalFontSize(14.4),14);
 assert.equal(normalizeTerminalFontSize(2),MIN_TERMINAL_FONT_SIZE);
 assert.equal(normalizeTerminalFontSize(500),MAX_TERMINAL_FONT_SIZE);
 for(const bad of [null,undefined,'','  ','abc',NaN,Infinity])assert.equal(normalizeTerminalFontSize(bad),DEFAULT_TERMINAL_FONT_SIZE,String(bad));
 assert.equal(normalizeTerminalFontSize('abc',15),15);
});
