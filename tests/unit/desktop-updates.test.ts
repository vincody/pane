import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createUpdates,type UpdateEngine} from '../../desktop/updates.ts';

class FakeUpdater extends EventEmitter {
 autoDownload=true;autoInstallOnAppQuit=true;allowPrerelease=true;allowDowngrade=true;
 checks=0;downloads=0;installs=0;installArguments:unknown[]=[];
 check=async()=>{this.emit('update-not-available',{version:'0.1.0'});};
 async checkForUpdates(){this.checks++;await this.check();return null;}
 async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:47.2});this.emit('update-downloaded',{version:'0.1.1'});return [];}
 quitAndInstall(...args:unknown[]){this.installs++;this.installArguments=args;}
}
async function fixture(supported=true,installApproved?:Parameters<typeof createUpdates>[0]['installApproved']){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pane-updates-')),preferencesFile=path.join(directory,'updates.json'),engine=new FakeUpdater();
 const options={engine:engine as unknown as UpdateEngine,version:'0.1.0',platform:'win32 x64',supported,preferencesFile,publish:()=>{},log:()=>{},installApproved};
 const updates=await createUpdates(options);
 return {updates,engine,options,async close(){updates.dispose();await fs.rm(directory,{recursive:true,force:true});}};
}
test('desktop updater excludes development builds and never silently downloads or installs',async()=>{
 const f=await fixture(false);try{
  await f.updates.check();await f.updates.download();f.updates.install();
  assert.equal(f.engine.checks,0);assert.equal(f.engine.downloads,0);assert.equal(f.engine.installs,0);
  assert.equal(f.updates.get().status,'unsupported');assert.equal(f.updates.get().version,'0.1.0');
  assert.equal(f.engine.autoDownload,false);assert.equal(f.engine.autoInstallOnAppQuit,false);assert.equal(f.engine.allowPrerelease,false);assert.equal(f.engine.allowDowngrade,false);
 }finally{await f.close();}
});
test('available update requires explicit download and install; ready update is retained on check',async()=>{
 const f=await fixture();try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.1',releaseNotes:'<b>Changes</b>\nFix layout'});};
  await f.updates.check();assert.equal(f.updates.get().status,'available');assert.equal(f.updates.get().releaseNotes,'Changes\nFix layout');assert.ok(f.updates.get().checkedAt);assert.equal(f.engine.downloads,0);
  f.updates.install();assert.equal(f.engine.installs,0);
  await f.updates.download();assert.equal(f.updates.get().status,'downloaded');assert.equal(f.updates.get().progress,100);assert.equal(f.engine.installs,0);
  await f.updates.check();assert.equal(f.engine.checks,1);assert.equal(f.updates.ready(),true);
  f.updates.install();assert.equal(f.engine.installs,1);
 }finally{await f.close();}
});
test('overlapping checks are coalesced and failures can be retried without claiming current',async()=>{
 const f=await fixture();try{
  let finish!:()=>void;f.engine.check=()=>new Promise<void>(resolve=>{finish=resolve;});
  const pending=f.updates.check(),alsoPending=f.updates.check();assert.equal(f.engine.checks,1);assert.equal(f.updates.get().status,'checking');
  finish();await Promise.all([pending,alsoPending]);
  f.engine.check=async()=>{throw new Error('offline');};await f.updates.check();assert.equal(f.updates.get().status,'error');
  f.engine.check=async()=>{f.engine.emit('update-not-available');};await f.updates.check();assert.equal(f.updates.get().status,'current');
 }finally{await f.close();}
});
test('automatic check preference survives restart and does not disable manual checks',async()=>{
 const f=await fixture();try{
  await Promise.all([f.updates.setAutomatic(true),f.updates.setAutomatic(false)]);
  assert.equal(f.updates.get().automatic,false);assert.deepEqual(JSON.parse(await fs.readFile(f.options.preferencesFile,'utf8')),{automatic:false});
  const restored=await createUpdates(f.options);try{assert.equal(restored.get().automatic,false);await restored.check();assert.equal(restored.get().status,'current');}finally{restored.dispose();}
 }finally{await f.close();}
});
test('a failed download exposes retry and never enables installation',async()=>{
 const f=await fixture();try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.1',releaseNotes:'x'.repeat(20000)});};
  await f.updates.check();assert.equal(f.updates.get().releaseNotes.length,16000);
  f.engine.downloadUpdate=async()=>{throw new Error('checksum mismatch');};await f.updates.download();assert.equal(f.updates.get().status,'error');assert.equal(f.updates.ready(),false);
  f.updates.install();assert.equal(f.engine.installs,0);
  await f.updates.check();assert.equal(f.updates.get().status,'available');
 }finally{await f.close();}
});
test('automatic checks remember their schedule, respect opt-out and stop on disposal',async context=>{
 context.mock.timers.enable({apis:['setTimeout','Date']});
 const f=await fixture();try{
  context.mock.timers.tick(4999);assert.equal(f.engine.checks,0);
  context.mock.timers.tick(1);assert.equal(f.engine.checks,1);await f.updates.check();
  context.mock.timers.tick(6*60*60*1000);assert.equal(f.engine.checks,2);await f.updates.check();
  await f.updates.setAutomatic(false);context.mock.timers.tick(6*60*60*1000);assert.equal(f.engine.checks,2);
  await f.updates.setAutomatic(true);f.updates.dispose();context.mock.timers.tick(6*60*60*1000);assert.equal(f.engine.checks,2);
 }finally{context.mock.timers.reset();await f.close();}
});

test('missing releases and missing update assets are distinguished from connectivity errors',async()=>{
 const f=await fixture();try{
  f.engine.check=async()=>{throw new Error('No published versions on GitHub');};await f.updates.check();
  assert.match(f.updates.get().message,/no public releases yet/);assert.equal(f.updates.get().status,'error');assert.ok(f.updates.get().checkedAt);
  f.engine.check=async()=>{throw Object.assign(new Error('missing metadata'),{code:'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'});};await f.updates.check();assert.match(f.updates.get().message,/missing its Windows update files/);
  f.engine.check=async()=>{throw new Error('offline');};await f.updates.check();assert.match(f.updates.get().message,/Check your connection/);
 }finally{await f.close();}
});


test('one explicit update approval downloads once, saves recovery and silently installs once',async()=>{
 let prepared=0;const f=await fixture(true,async()=>{prepared++;f.updates.install();return 'started';});try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.2'});};await f.updates.check();assert.equal(f.engine.downloads,0);
  let finish!:()=>void;f.engine.downloadUpdate=async()=>{f.engine.downloads++;await new Promise<void>(resolve=>{finish=resolve;});f.engine.emit('update-downloaded',{version:'0.1.2'});return [];};
  const pending=f.updates.update();await f.updates.update();assert.equal(f.engine.downloads,1);assert.equal(prepared,0);finish();await pending;await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(prepared,1);assert.equal(f.engine.installs,1);assert.deepEqual(f.engine.installArguments,[true,true]);assert.equal(f.updates.get().status,'installing');
  f.engine.emit('update-downloaded',{version:'0.1.2'});await f.updates.update();assert.equal(f.engine.installs,1);
 }finally{await f.close();}
});

test('approved update waits for busy writes and stops when recovery cannot be saved',async context=>{
 context.mock.timers.enable({apis:['setTimeout','setInterval']});let attempts=0,verdict:'busy'|'blocked'|'started'='busy';
 const f=await fixture(true,async()=>{attempts++;if(verdict==='started')f.updates.install();return verdict;});try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.2'});};await f.updates.check();await f.updates.update();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.updates.get().status,'waiting');assert.equal(f.engine.installs,0);
  verdict='blocked';context.mock.timers.tick(1500);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.updates.get().status,'downloaded');assert.match(f.updates.get().message,/Save your files/);assert.equal(attempts,2);context.mock.timers.tick(3000);assert.equal(attempts,2);
  verdict='started';await f.updates.update();assert.equal(f.engine.downloads,1);assert.equal(f.engine.installs,1);
 }finally{context.mock.timers.reset();await f.close();}
});

test('failed download cancels automatic installation until the user retries',async()=>{
 const f=await fixture(true,async()=>{f.updates.install();return 'started';});try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.2'});};await f.updates.check();const download=f.engine.downloadUpdate.bind(f.engine);f.engine.downloadUpdate=async()=>{throw Error('offline');};await f.updates.update();assert.equal(f.updates.get().status,'error');assert.equal(f.engine.installs,0);
  f.engine.emit('update-downloaded',{version:'0.1.2'});await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.engine.installs,0);f.engine.downloadUpdate=download;await f.updates.update();assert.equal(f.engine.installs,1);
 }finally{await f.close();}
});


test('background refresh failures retain a known update, and successful check time survives restart',async context=>{
 context.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,9,16)});
 const f=await fixture();let restored:Awaited<ReturnType<typeof createUpdates>>|undefined;
 try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.2'});};await f.updates.check();const successful=JSON.parse(await fs.readFile(f.options.preferencesFile,'utf8')).lastSuccessfulCheckAt;assert.ok(successful);
  f.engine.check=async()=>{throw Error('offline');};await f.updates.check(true);assert.equal(f.updates.get().status,'available');assert.equal(f.updates.get().latestVersion,'0.1.2');assert.match(f.updates.get().message,/previously found/);assert.equal(JSON.parse(await fs.readFile(f.options.preferencesFile,'utf8')).lastSuccessfulCheckAt,successful);
  f.updates.dispose();restored=await createUpdates(f.options);assert.ok(restored.get().checkedAt);assert.equal(restored.get().status,'available');assert.equal(restored.get().latestVersion,'0.1.2');const calls=f.engine.checks;context.mock.timers.tick(5000);await restored.backgroundCheck();assert.equal(f.engine.checks,calls);await restored.download();assert.equal(f.engine.checks,calls+1);assert.equal(f.engine.downloads,0);assert.equal(restored.get().status,'error');
 }finally{restored?.dispose();context.mock.timers.reset();await f.close();}
});


test('Update now refreshes cached release metadata after app restart before downloading',async()=>{
 const f=await fixture();let restored:Awaited<ReturnType<typeof createUpdates>>|undefined;
 try{
  f.engine.check=async()=>{f.engine.emit('update-available',{version:'0.1.2'});};await f.updates.check();f.updates.dispose();
  const engine=new FakeUpdater();engine.check=async()=>{engine.emit('update-available',{version:'0.1.2'});};const download=engine.downloadUpdate.bind(engine);engine.downloadUpdate=async()=>{assert.equal(engine.checks,1);return download();};
  restored=await createUpdates({...f.options,engine:engine as unknown as UpdateEngine,installApproved:async()=>{restored!.install();return 'started';}});assert.equal(restored.get().status,'available');await restored.update();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(engine.checks,1);assert.equal(engine.downloads,1);assert.equal(engine.installs,1);
 }finally{restored?.dispose();await f.close();}
});
