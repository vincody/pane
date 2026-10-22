import test from 'node:test';
import assert from 'node:assert/strict';
import {formatWorked} from '../../client/src/features/notifications/notification-duration.ts';
test('worked duration is short and hidden when unknown or under a second',()=>{
 assert.equal(formatWorked(7400),'7s');
 assert.equal(formatWorked(83000),'1m 23s');
 assert.equal(formatWorked(3720000),'1h 2m');
 for(const value of [undefined,NaN,-5,0,999])assert.equal(formatWorked(value),'',String(value));
});
