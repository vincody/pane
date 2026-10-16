import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readNotificationSoundChoices,readNotificationVolume,readNotificationSoundMode} from '../../client/src/features/notifications/notification-sound.ts';

test('sound mode preserves explicit choices and migrates the previous sound switch',()=>{
 assert.equal(readNotificationSoundMode({}),'app');
 assert.equal(readNotificationSoundMode({sound:true}),'app');
 assert.equal(readNotificationSoundMode({sound:false}),'off');
 for(const soundMode of ['app','system','off'] as const)assert.equal(readNotificationSoundMode({soundMode,sound:false}),soundMode);
 assert.equal(readNotificationSoundMode({soundMode:'invalid',sound:false}),'off');
});

test('sound choices fall back to the defaults for missing or unknown sounds',()=>{
 assert.deepEqual(readNotificationSoundChoices({}),{done:'done',blocked:'request',error:'request'});
 assert.deepEqual(readNotificationSoundChoices({sounds:{done:'arcade',blocked:'none',error:'missing'}}),{done:'arcade',blocked:'none',error:'request'});
});

test('volume is clamped to 0-100 and defaults to full',()=>{
 assert.equal(readNotificationVolume({}),100);
 assert.equal(readNotificationVolume({volume:'abc'}),100);
 assert.equal(readNotificationVolume({volume:0}),0);
 assert.equal(readNotificationVolume({volume:250}),100);
 assert.equal(readNotificationVolume({volume:-5}),0);
});
