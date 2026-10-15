import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../../server/src/app.ts';
import {serverPort} from '../helpers/http.ts';
import type {LocalToolStatus} from '../../shared/contracts.ts';

test('desktop serves bundled assets and owns authenticated native pickers without changing web defaults',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pane-desktop-host-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const assetsDir=path.join(root,'assets');await fs.mkdir(assetsDir);await fs.writeFile(path.join(assetsDir,'index.html'),'<title>Bundled Pane</title>__AI_WEB_TOKEN__');
 let picks=0;const app=await createApp({initialRoot:root,stateDir:path.join(root,'state'),agentHome:root,assetsDir,nativePickers:{folder:async()=>{picks++;return root;},key:async()=>{picks++;return null;},downloads:async()=>path.join(root,'Downloads')}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.closeSessions();await new Promise<void>(resolve=>app.server.close(()=>resolve()));});
 const base=`http://127.0.0.1:${serverPort(app.server)}`,headers={'X-AI-Web-Token':app.token};
 assert.match(await (await fetch(base)).text(),/Bundled Pane/);
 assert.equal((await fetch(base+'/api/select-workspace-folder',{method:'POST'})).status,403);
 assert.equal((await fetch(base+'/api/ssh/select-key',{method:'POST',headers:{...headers,Origin:'https://example.com'}})).status,403);assert.equal(picks,0);
 assert.deepEqual(await (await fetch(base+'/api/select-workspace-folder',{method:'POST',headers})).json(),{path:root});
 assert.deepEqual(await (await fetch(base+'/api/ssh/select-key',{method:'POST',headers})).json(),{path:null});assert.equal(picks,2);
 assert.deepEqual(await (await fetch(base+'/api/project-defaults',{headers})).json(),{parent:path.join(root,'Downloads')});
 assert.equal((await fetch(base+'/api/integrations/tools')).status,403);
 const result=await (await fetch(base+'/api/integrations/tools',{headers})).json() as {tools:LocalToolStatus[]};
 assert.deepEqual(result.tools.map(tool=>tool.id),['git','ssh','codex','claude']);assert.ok(result.tools.every(tool=>typeof tool.installed==='boolean'||tool.installed===null));
 assert.ok(result.tools.every(tool=>!('path' in tool)));
});
