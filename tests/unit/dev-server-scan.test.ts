import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {collectDevServerPorts,parseNetstatListeners,parseLsofListeners} from '../../server/src/features/dev-servers/dev-server-scan.ts';

test('netstat parser accepts only TCP listeners with valid PID and address, including IPv6',()=>{
 const text='  TCP 127.0.0.1:5173 0.0.0.0:0 LISTENING 42\n TCP [::1]:3000 [::]:0 LISTENING 43\n TCP 127.0.0.1:5173 0.0.0.0:0 LISTENING 42\n UDP 0.0.0.0:9 *:* LISTENING 44\n TCP 127.0.0.1:99 0.0.0.0:0 ESTABLISHED 42\n TCP 0.0.0.0:65536 0.0.0.0:0 LISTENING 42\n TCP 0.0.0.0:80 0.0.0.0:0 LISTENING nope';
 assert.deepEqual(parseNetstatListeners(text),[{host:'127.0.0.1',port:5173,pid:42},{host:'::1',port:3000,pid:43}]);
});
test('Windows collector joins listeners to shared process metadata without another process command',async()=>{
 const calls:{file:string;args:string[]}[]=[];const processes=[{ProcessId:42,ParentProcessId:1,Name:'node.exe',CommandLine:'node vite',CreationDate:'2026-10-14'}];
 const scan=await collectDevServerPorts({platform:'win32',processes:async()=>processes,run:async(file,args)=>{calls.push({file,args});return 'TCP 0.0.0.0:5173 0.0.0.0:0 LISTENING 42';}});
 assert.equal(scan.complete,true);assert.equal(scan.processes,processes);assert.deepEqual(scan.listeners,[{host:'0.0.0.0',port:5173,pid:42,processName:'node.exe',commandLine:'node vite',startTime:'2026-10-14'}]);assert.deepEqual(calls,[{file:'netstat.exe',args:['-ano','-p','tcp']}]);
});
test('collector reports incomplete scans without inventing listeners',async()=>{
 const rows=[{ProcessId:1,ParentProcessId:0}];const scan=await collectDevServerPorts({platform:'win32',processes:async()=>rows,run:async()=>{throw new Error('timeout');}});assert.equal(scan.complete,false);assert.equal(scan.error,'timeout');assert.deepEqual(scan.listeners,[]);assert.equal(scan.processes,rows);
});
test('lsof machine parser retains PID association for wildcard and IPv6 listeners',()=>{
 assert.deepEqual(parseLsofListeners('p8\ncnode\nf4\nn*:3000\np9\ncpython\nn[::1]:8000\n'),[{pid:8,host:'*',port:3000,processName:'node'},{pid:9,host:'::1',port:8000,processName:'python'}]);
});
test('Linux collector maps actual socket inode owners and cwd while excluding established sockets',async t=>{
 if(process.platform==='win32'){t.skip('Unix symbolic links require a Unix host');return;}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pane-proc-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'net'));await fs.mkdir(path.join(root,'42','fd'),{recursive:true});await fs.writeFile(path.join(root,'net','tcp'),'header\n0: 0100007F:1455 00000000:0000 0A 0:0 0:0 0 0 0 123\n1: 0100007F:1456 00000000:0000 01 0:0 0:0 0 0 0 124\n');await fs.writeFile(path.join(root,'net','tcp6'),'header\n');await fs.symlink('socket:[123]',path.join(root,'42','fd','1'));await fs.symlink(root,path.join(root,'42','cwd'));
 const scan=await collectDevServerPorts({platform:'linux',procRoot:root,processes:async()=>[{ProcessId:42,ParentProcessId:1,Name:'node'}]});assert.equal(scan.complete,true);assert.equal(scan.listeners.length,1);assert.equal(scan.listeners[0].port,5205);assert.equal(scan.listeners[0].host,'127.0.0.1');assert.equal(scan.listeners[0].cwd,root);
});
