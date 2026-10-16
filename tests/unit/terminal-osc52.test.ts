import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOsc52Handler,parseOsc52} from '../../client/src/features/terminal/terminal-osc52.ts';

const b64=(text:string)=>Buffer.from(text).toString('base64');

test('OSC 52 writes decode UTF-8 and ignore queries, bad payloads and empty ones',()=>{
 assert.deepEqual(parseOsc52('c;'+b64('xin chào\nbạn')),{kind:'write',text:'xin chào\nbạn'});
 assert.deepEqual(parseOsc52(';'+b64('tmux')),{kind:'write',text:'tmux'});
 assert.deepEqual(parseOsc52('c;'+b64('wrapped').replace(/(.{4})/g,'$1\n')),{kind:'write',text:'wrapped'});
 for(const data of ['c;?','c;','c;***','nosemicolon','zz;'+b64('x'),'c;'+'A'.repeat(128*1024+4)])assert.deepEqual(parseOsc52(data),{kind:'ignored'},data.slice(0,12));
});

test('OSC 52 handler writes only the last copy of a burst and skips replayed output',async()=>{
 const written:string[]=[];let replaying=false;
 const handler=createOsc52Handler({isReplaying:()=>replaying,write:async text=>{written.push(text);}});
 assert.equal(handler('c;'+b64('first')),true);assert.equal(handler('c;'+b64('second')),true);
 await Promise.resolve();assert.deepEqual(written,['second']);
 replaying=true;handler('c;'+b64('replayed'));await Promise.resolve();assert.deepEqual(written,['second']);
 replaying=false;handler('c;?');await Promise.resolve();assert.deepEqual(written,['second']);
});

test('OSC 52 handler reports a failed clipboard write',async()=>{
 let failures=0;
 createOsc52Handler({isReplaying:()=>false,write:async()=>{throw new Error('denied');},onFailure:()=>{failures++;}})('c;'+b64('x'));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(failures,1);
});
