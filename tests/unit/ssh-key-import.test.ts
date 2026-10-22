import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {importSshKey} from '../../server/src/features/terminal/ssh-key-import.ts';

const key='-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n';
test('an imported key is copied into the key folder and keeps working after the original is deleted',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'pane-import-')),source=path.join(root,'id_test'),dir=path.join(root,'keys');writeFileSync(source,key);
 try{
  const copied=await importSshKey(source,dir);
  assert.equal(path.dirname(copied),dir);rmSync(source);
  assert.equal(readFileSync(copied,'utf8'),key);
  writeFileSync(source,key);assert.equal(await importSshKey(source,dir),copied,'the same key is not copied twice');
  writeFileSync(source,key.replace('abc','def'));assert.equal(path.basename(await importSshKey(source,dir)),'id_test-2','a different key with the same name gets a new name');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('files that are not private keys are refused',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'pane-import-')),source=path.join(root,'id_test.pub');writeFileSync(source,'ssh-ed25519 AAAA');
 try{await assert.rejects(importSshKey(source,path.join(root,'keys')),/not an SSH private key/);}finally{rmSync(root,{recursive:true,force:true});}
});
