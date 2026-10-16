import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddressDetector,isLocalHost,normalizeLocalAddress,stripTerminalEscapes} from '../../client/src/features/browser/local-address.ts';
import {parseLinkPreferences} from '../../client/src/features/browser/link-preferences.ts';
import {webLink} from '../../client/src/features/browser/link-opener.ts';
test('only addresses on this machine or its local network count as local',()=>{
 for(const host of ['localhost','app.localhost','127.0.0.1','127.5.0.2','[::1]','0.0.0.0','10.1.2.3','192.168.0.20','172.16.4.4','172.31.255.1'])assert.equal(isLocalHost(host),true,host);
 for(const host of ['example.com','8.8.8.8','172.32.0.1','172.15.0.1','192.169.0.1','localhost.example.com','notlocalhost'])assert.equal(isLocalHost(host),false,host);
});
test('addresses are tidied: trailing punctuation, 0.0.0.0 and fragments go; credentials and other schemes are refused',()=>{
 assert.equal(normalizeLocalAddress('http://localhost:5173/'),'http://localhost:5173/');
 assert.equal(normalizeLocalAddress('http://localhost:3000).'),'http://localhost:3000/');
 assert.equal(normalizeLocalAddress('http://0.0.0.0:8080/app#top'),'http://localhost:8080/app');
 for(const value of ['https://example.com/','http://user:pass@localhost:3000/','ftp://localhost/','file:///C:/x','not a url'])assert.equal(normalizeLocalAddress(value),null,value);
});
test('terminal colors and escape sequences are removed before matching',()=>{
 assert.equal(stripTerminalEscapes('\x1b[32m  ➜  Local:\x1b[0m   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[0m'),'  ➜  Local:   http://localhost:5173/');
 const detector=createAddressDetector();
 assert.deepEqual(detector.push('\x1b[32m➜\x1b[39m  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\r\n'),['http://localhost:5173/']);
});
test('a server is reported once, even when it is listed on several addresses or printed again',()=>{
 const detector=createAddressDetector();
 assert.deepEqual(detector.push('  Local:   http://localhost:5173/\r\n  Network: http://192.168.1.20:5173/\r\n'),['http://localhost:5173/']);
 assert.deepEqual(detector.push('restarting...\r\nLocal: http://localhost:5173/\r\n'),[]);
 assert.deepEqual(detector.push('Docs: https://vite.dev/guide\r\nApi: http://127.0.0.1:3001/health\r\n'),['http://127.0.0.1:3001/health']);
});
test('an address split across chunks is only reported once it is complete',()=>{
 const detector=createAddressDetector();
 assert.deepEqual(detector.push('ready at http://local'),[]);
 assert.deepEqual(detector.push('host:51'),[]);
 assert.deepEqual(detector.push('73/\r\n'),['http://localhost:5173/']);
 const trailing=createAddressDetector();
 assert.deepEqual(trailing.push('Local: http://localhost:4000'),[]);
 assert.deepEqual(trailing.push('\r\n'),['http://localhost:4000/']);
});
test('external sites and credentials in terminal output are ignored',()=>{
 const detector=createAddressDetector();
 assert.deepEqual(detector.push('See https://example.com/docs and http://user:pw@localhost:3000/x and http://8.8.8.8:80/\r\n'),[]);
});
test('link preferences fall back to asking and detecting when storage is empty or damaged',()=>{
 assert.deepEqual(parseLinkPreferences(null),{open:'ask',detect:true});
 assert.deepEqual(parseLinkPreferences('{"open":"app","detect":false}'),{open:'app',detect:false});
 assert.deepEqual(parseLinkPreferences('{"open":"system"}'),{open:'system',detect:true});
 assert.deepEqual(parseLinkPreferences('{"open":"elsewhere","detect":"yes"}'),{open:'ask',detect:true});
 assert.deepEqual(parseLinkPreferences('not json'),{open:'ask',detect:true});
});
test('only credential-free http(s) links are opened',()=>{
 assert.equal(webLink('https://example.com/a'),'https://example.com/a');
 for(const value of ['javascript:alert(1)','file:///C:/x','data:text/html,x','https://user:pw@example.com','nonsense',''])assert.equal(webLink(value),null,value);
});
