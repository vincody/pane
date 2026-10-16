import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStartupLaunch,powerShellStartupArgs,powerShellStartupScript} from '../../server/src/features/terminal/terminal-startup.ts';

const id='123e4567-e89b-12d3-a456-426614174000';
const decode=(args:string[])=>Buffer.from(args.at(-1)!,'base64').toString('utf16le');

test('only a known agent, a UUID and a directory are accepted from the client',()=>{
 assert.deepEqual(parseStartupLaunch({agent:'claude'}),{agent:'claude'});
 assert.deepEqual(parseStartupLaunch({agent:'codex',resume:{id,cwd:'C:\\work\\my app'}}),{agent:'codex',resume:{id,cwd:'C:\\work\\my app'}});
 for(const bad of [null,undefined,'claude',{},{agent:'bash'},{agent:'claude; calc'},{agent:'claude',resume:null},{agent:'claude',resume:{id:'not-a-uuid',cwd:'C:\\x'}},{agent:'claude',resume:{id:id+'; calc',cwd:'C:\\x'}},{agent:'claude',resume:{id,cwd:''}},{agent:'claude',resume:{id,cwd:'C:\\x\ncalc'}},{agent:'claude',resume:{id,cwd:'x'.repeat(3000)}}])assert.equal(parseStartupLaunch(bad),null,JSON.stringify(bad)?.slice(0,60));
});

test('the PowerShell command is built from the validated parts and passed as an encoded command',()=>{
 assert.equal(powerShellStartupScript({agent:'claude'}),'claude');
 assert.equal(powerShellStartupScript({agent:'codex',resume:{id,cwd:"C:\\Users\\O'Neil\\my app"}}),`try { Set-Location -LiteralPath 'C:\\Users\\O''Neil\\my app' -ErrorAction Stop; codex resume ${id} } catch { Write-Error $_ }`);
 assert.match(powerShellStartupScript({agent:'claude',resume:{id,cwd:'C:\\x'}}),/claude --resume 123e4567-/);
 const args=powerShellStartupArgs({agent:'claude'});
 assert.deepEqual(args.slice(0,3),['-NoLogo','-NoExit','-EncodedCommand']);assert.equal(decode(args),'claude');
 assert.ok(args.at(-1)!.length<32000);
});
