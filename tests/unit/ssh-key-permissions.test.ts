import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectSshKey,sshKeyAclCommands} from '../../server/src/features/terminal/ssh-key-permissions.ts';

test('the key is stripped of inherited and broad access, then given to the user first so it is never left without an owner',()=>{
 assert.deepEqual(sshKeyAclCommands('C:\k','PC\me'),[['C:\k','/grant:r','PC\me:(R)'],['C:\k','/inheritance:r'],['C:\k','/remove:g','*S-1-1-0','*S-1-5-11','*S-1-5-32-545']]);
});

test('permissions are only changed on Windows and failures do not throw',()=>{
 const calls:string[][]=[];
 protectSshKey('/k',args=>calls.push(args),'linux');
 assert.equal(calls.length,0);
 protectSshKey('C:\k',args=>calls.push(args),'win32');
 assert.equal(calls.length,3);
 assert.doesNotThrow(()=>protectSshKey('C:\k',()=>{throw new Error('denied');},'win32'));
});
