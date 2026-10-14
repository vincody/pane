import test from 'node:test';
import assert from 'node:assert/strict';
import {sshArguments,validateSshConnection} from '../../shared/ssh-connection.ts';
test('SSH aliases retain OpenSSH config defaults and explicit user/port are separate arguments',()=>{
 assert.deepEqual(sshArguments({name:'Work server',host:'work-server'}),['work-server']);
 assert.deepEqual(sshArguments({name:'VPS',host:'192.0.2.1',username:'root',port:2222}),['-p','2222','-l','root','192.0.2.1']);
 assert.deepEqual(sshArguments({host:'2001:db8::1'}),['2001:db8::1']);
});
test('SSH metadata excludes credentials and rejects injected options and invalid ports',()=>{
 assert.deepEqual(validateSshConnection({name:'VPS',host:'example.com',password:'secret',privateKey:'secret',command:'anything'}),{name:'VPS',host:'example.com'});
 for(const host of ['-oProxyCommand=bad','host;command','host name','host\ncommand'])assert.throws(()=>sshArguments({host}));
 for(const port of [0,65536,22.5,'22'])assert.throws(()=>sshArguments({host:'example.com',port}));
 assert.throws(()=>sshArguments({host:'example.com',username:'user;command'}));
});

test('selected SSH key paths are separate arguments and never interpreted as commands',()=>{
 const identityFile='C:\\Users\\Example User\\.ssh\\id_ed25519';
 assert.deepEqual(sshArguments({host:'server',identityFile}),['-i',identityFile,'server']);
 assert.equal(validateSshConnection({host:'server',identityFile}).identityFile,identityFile);
 for(const identityFile of ['', 'key\ncommand', 'key\0bad',42])assert.throws(()=>sshArguments({host:'server',identityFile}));
});
