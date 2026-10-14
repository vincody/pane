import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import net from 'node:net';
import {promisify} from 'node:util';
import {createProjectFolder} from '../../server/src/features/files/new-project.ts';
import {isWithin} from '../../server/src/features/files/files.ts';

test('new projects initialize main and preserve existing folders and invalid destinations',async t=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'pane-new-project-'));
 t.after(async()=>{assert.ok(isWithin(path.resolve(os.tmpdir()),parent));await fs.rm(parent,{recursive:true,force:true});});
 const root=await createProjectFolder({mode:'create',name:'My project',parent});
 const execute=promisify(execFile);assert.equal((await execute('git',['-C',root,'symbolic-ref','--short','HEAD'])).stdout.trim(),'main');
 await fs.writeFile(path.join(root,'keep.txt'),'keep');await assert.rejects(createProjectFolder({mode:'create',name:'My project',parent}),/already exists/);assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'keep');
 for(const name of ['../escape','CON','name.','a/b',''])await assert.rejects(createProjectFolder({mode:'create',name,parent}),/valid folder name/);
 await assert.rejects(createProjectFolder({mode:'create',name:'missing',parent:path.join(parent,'absent')}),/existing parent/);
 await assert.rejects(createProjectFolder({mode:'clone',name:'bad',parent,url:'ext::malicious'}),/repository URL/);await assert.rejects(fs.stat(path.join(parent,'bad')),/ENOENT/);
});

test('clone creates a usable workspace from a Git remote',async t=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'pane-clone-project-'));
 const reservation=net.createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
 const source=await createProjectFolder({mode:'create',name:'source',parent}),execute=promisify(execFile);
 await fs.writeFile(path.join(source,'README.md'),'cloned content');await execute('git',['-C',source,'add','.']);await execute('git',['-C',source,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','initial']);
 const daemon=spawn('git',['daemon','--export-all','--listen=127.0.0.1',`--port=${port}`,`--base-path=${parent}`,parent],{windowsHide:true,stdio:'ignore'});
 t.after(async()=>{const exited=new Promise<void>(resolve=>daemon.once('exit',()=>resolve()));if(daemon.exitCode===null){daemon.kill();await exited;}assert.ok(isWithin(path.resolve(os.tmpdir()),parent));await fs.rm(parent,{recursive:true,force:true});});
 let ready=false;for(let attempt=0;attempt<50&&!ready;attempt++){ready=await new Promise<boolean>(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});if(!ready)await new Promise(resolve=>setTimeout(resolve,50));}assert.ok(ready,'Git test remote started');
 const cloned=await createProjectFolder({mode:'clone',name:'cloned',parent,url:`git://127.0.0.1:${port}/source`});assert.equal(await fs.readFile(path.join(cloned,'README.md'),'utf8'),'cloned content');assert.equal((await execute('git',['-C',cloned,'status','--porcelain'])).stdout.trim(),'');
});
