import {expect,type Locator} from '@playwright/test';
export function expectComposerValue(locator:Locator,value:string|RegExp){const check=expect.poll(()=>locator.evaluate(element=>(element as HTMLTextAreaElement).value));return value instanceof RegExp?check.toMatch(value):check.toBe(value);}
