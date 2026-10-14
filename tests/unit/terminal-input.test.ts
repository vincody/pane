import test from 'node:test';
import assert from 'node:assert/strict';
import {trackPromptInput} from '../../client/src/features/terminal/terminal-input.ts';
test('only real prompt submission starts a notification work turn',()=>{
 assert.equal(trackPromptInput('').submitted,false);
 assert.equal(trackPromptInput('\r').submitted,false);
 assert.equal(trackPromptInput('/model\r').submitted,false);
 assert.equal(trackPromptInput('\x1b[1;2D').submitted,false);
 assert.equal(trackPromptInput('Fix resize\r').submitted,true);
 const typing=trackPromptInput('Fix resize');
 assert.equal(trackPromptInput('\r',typing.draft).submitted,true);
 assert.equal(trackPromptInput('text\x15\r').submitted,false);
});
