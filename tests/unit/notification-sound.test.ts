import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readNotificationSoundMode} from '../../client/src/features/notifications/notification-sound.ts';

test('sound mode preserves explicit choices and migrates the previous sound switch',()=>{
 assert.equal(readNotificationSoundMode({}),'app');
 assert.equal(readNotificationSoundMode({sound:true}),'app');
 assert.equal(readNotificationSoundMode({sound:false}),'off');
 for(const soundMode of ['app','system','off'] as const)assert.equal(readNotificationSoundMode({soundMode,sound:false}),soundMode);
 assert.equal(readNotificationSoundMode({soundMode:'invalid',sound:false}),'off');
});
