import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationTitle} from '../client/notification-title.js';
test('notification titles remove CLI action-required decorations',()=>{
 for(const title of ['[ ! ] action required','[! Action required]','Codex | Action required','[ ! ] Action Required: Codex','Codex [Action required]','⚠ Action required — Codex']){
   assert.equal(notificationTitle({agent:'codex',name:title}),'Codex',title);
 }
 assert.equal(notificationTitle({agent:'codex',name:'Fix resizing [! Action required]'}),'Fix resizing');
});
