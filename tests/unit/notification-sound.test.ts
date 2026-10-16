import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readNotificationSoundAll,readNotificationSoundChoices,readNotificationSoundScope,readNotificationVolume,readNotificationSoundMode,soundForKind} from '../../client/src/features/notifications/notification-sound.ts';

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

test('one sound can replace the per-status choices',()=>{
 assert.equal(readNotificationSoundScope({}),'each');
 assert.equal(readNotificationSoundScope({soundScope:'all'}),'all');
 assert.equal(readNotificationSoundScope({soundScope:'bogus'}),'each');
 assert.equal(readNotificationSoundAll({}),'done');
 assert.equal(readNotificationSoundAll({soundAll:'arcade'}),'arcade');
 assert.equal(readNotificationSoundAll({soundAll:'none'}),'none');
 assert.equal(readNotificationSoundAll({soundAll:'missing'}),'done');
 const sounds={done:'ping',blocked:'arcade',error:'none'};
 assert.equal(soundForKind({soundScope:'each',soundAll:'shamisen',sounds},'blocked'),'arcade');
 assert.equal(soundForKind({soundScope:'each',soundAll:'shamisen',sounds},'error'),'none');
 for(const kind of ['done','blocked','error'] as const)assert.equal(soundForKind({soundScope:'all',soundAll:'shamisen',sounds},kind),'shamisen');
});
