import test from 'node:test';
import assert from 'node:assert/strict';
import {describeLoadError,sanitizeUrl} from '../../client/src/features/browser/browser-url.ts';
import {isOwnServer} from '../../client/src/features/browser/browser-pane.ts';
import {cleanUserAgent,isPaneAddress,isPaneRequest,webAddress} from '../../desktop/browser-url.ts';
test('typed text becomes an http(s) address, local hosts stay on http and other text is searched',()=>{
 assert.equal(sanitizeUrl('  https://example.com/a?b=1 '),'https://example.com/a?b=1');
 assert.equal(sanitizeUrl('http://localhost:3000'),'http://localhost:3000');
 assert.equal(sanitizeUrl('localhost:5173/app'),'http://localhost:5173/app');
 assert.equal(sanitizeUrl('127.0.0.1:8080'),'http://127.0.0.1:8080');
 assert.equal(sanitizeUrl('192.168.1.20:3000'),'http://192.168.1.20:3000');
 assert.equal(sanitizeUrl('example.com/docs'),'https://example.com/docs');
 assert.equal(sanitizeUrl('how to center a div'),'https://www.google.com/search?q=how%20to%20center%20a%20div');
 assert.equal(sanitizeUrl(''),'');assert.equal(sanitizeUrl('   '),'');
});
test('schemes other than http and https are searched, never opened',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,<b>x</b>','file:///C:/secret.txt','git@github.com:org/repo.git','https://']){
  const result=sanitizeUrl(value);assert.match(result,/^https:\/\/www\.google\.com\/search\?q=/,value);
 }
});
test('load errors get plain titles',()=>{
 assert.equal(describeLoadError(-102,'ERR_CONNECTION_REFUSED').title,'Connection refused');
 assert.equal(describeLoadError(-105,'ERR_NAME_NOT_RESOLVED').title,'Address not found');
 assert.equal(describeLoadError(-202,'ERR_CERT_AUTHORITY_INVALID').title,'Certificate problem');
 assert.equal(describeLoadError(-999,'ERR_SOMETHING_ODD').detail,'something odd');
});
test('the desktop guard accepts only credential-free http(s) addresses',()=>{
 assert.equal(webAddress('https://example.com/x')?.hostname,'example.com');assert.equal(webAddress('http://localhost:3000')?.port,'3000');
 for(const value of ['file:///C:/x','javascript:alert(1)','chrome://settings','about:blank','https://user:pass@example.com','not a url','ftp://example.com'])assert.equal(webAddress(value),null,value);
});
test('pages cannot reach Pane’s own local server on any loopback spelling',()=>{
 const pane='http://127.0.0.1:17317';
 for(const value of ['http://127.0.0.1:17317/api/x','http://localhost:17317/','http://[::1]:17317/'])assert.equal(isPaneAddress(new URL(value),pane),true,value);
 for(const value of ['http://127.0.0.1:3000/','http://localhost:5173/','https://example.com/','https://127.0.0.1:17317/','http://127.0.0.1/'])assert.equal(isPaneAddress(new URL(value),pane),false,value);
 assert.equal(isPaneAddress(new URL('http://localhost:1/'),''),false);
});
test('the user agent hides Electron and the app name',()=>{
 const agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Pane/0.1.3 Chrome/140.0.0.0 Electron/44.7.2 Safari/537.36';
 assert.equal(cleanUserAgent(agent,'Pane'),'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
});
test('requests to Pane are recognised across http, WebSocket and loopback spellings',()=>{
 const pane='http://127.0.0.1:17317';
 for(const value of ['http://127.0.0.1:17317/api/x','ws://127.0.0.1:17317/api/terminal','ws://localhost:17317/','http://[::1]:17317/'])assert.equal(isPaneRequest(value,pane),true,value);
 for(const value of ['http://127.0.0.1:3000/','wss://example.com/socket','data:text/plain,hi','blob:http://127.0.0.1:17317/abc','not a url'])assert.equal(isPaneRequest(value,pane),false,value);
});
test('the Browser tab refuses Pane’s own address before it navigates',()=>{
 const here={protocol:'http:',port:'17317'};
 for(const value of ['http://127.0.0.1:17317/api/projects','http://localhost:17317','http://[::1]:17317/'])assert.equal(isOwnServer(value,here),true,value);
 for(const value of ['http://localhost:3000','https://localhost:17317','https://example.com','nonsense'])assert.equal(isOwnServer(value,here),false,value);
});
