import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir,userInfo} from 'node:os';
import path from 'node:path';
import {protectSshKey,sshKeyAclCommands,windowsAccount} from '../../server/src/features/terminal/ssh-key-permissions.ts';

test('the key is given to the user first so it is never left without an owner, then stripped of inherited and broad access',()=>{
 assert.deepEqual(sshKeyAclCommands('C:\\k','PC\\me'),[['C:\\k','/grant:r','PC\\me:(R)'],['C:\\k','/inheritance:r'],['C:\\k','/remove:g','*S-1-1-0','*S-1-5-11','*S-1-5-32-545']]);
});

test('permissions are only changed on Windows and failures do not throw',()=>{
 const calls:string[][]=[];
 protectSshKey('/k',args=>calls.push(args),'linux');
 assert.equal(calls.length,0);
 protectSshKey('C:\\k',args=>calls.push(args),'win32');
 assert.equal(calls.length,3);
 assert.doesNotThrow(()=>protectSshKey('C:\\k',()=>{throw new Error('denied');},'win32'));
});

test('the account name is DOMAIN\\user, or just the user without a domain',()=>{
 assert.equal(windowsAccount('PC','me'),'PC\\me');
 assert.equal(windowsAccount(undefined,'me'),'me');
});

test('the real icacls leaves only the current user on a key file',{skip:process.platform!=='win32'},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'pane-key-')),file=path.join(dir,'key');writeFileSync(file,'x');
 try{
  protectSshKey(file);
  const acl=execFileSync('icacls',[file]).toString();
  assert.ok(acl.toLowerCase().includes(`${userInfo().username.toLowerCase()}:(r)`),acl);
  assert.doesNotMatch(acl,/Authenticated Users|BUILTIN\\Users|Everyone/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
