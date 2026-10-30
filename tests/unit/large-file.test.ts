import assert from 'node:assert/strict';
import test from 'node:test';
import {isLargeText} from '../../client/src/features/files/large-file.ts';

test('small multi-line text is not large', () => assert.equal(isLargeText('{\n  "a": 1\n}\n'), false));
test('one very long line (minified JSON) is large', () => assert.equal(isLargeText(JSON.stringify({a:'x'.repeat(20_000)})), true));
test('many lines are large', () => assert.equal(isLargeText('a\n'.repeat(20_001)), true));
test('big total size is large', () => assert.equal(isLargeText(('x'.repeat(100)+'\n').repeat(4_000)), true));
