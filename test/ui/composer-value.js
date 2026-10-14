import {expect} from '@playwright/test';
export function expectComposerValue(locator,value){const check=expect.poll(()=>locator.evaluate(element=>element.value));return value instanceof RegExp?check.toMatch(value):check.toBe(value);}
