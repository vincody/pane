import {test,expect} from '@playwright/test';

test('saved sidebar geometry is correct before the app bundle starts and remains stable',async({page})=>{
 await page.addInitScript(()=>{
  if(localStorage.getItem('layout-fixture'))return;
  localStorage.setItem('layout-fixture','true');localStorage.setItem('ai-web.left-panel-width','312');localStorage.setItem('ai-web.right-panel-width','334');localStorage.setItem('ai-web.files-open','false');
 });
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/assets/index-*.js',async route=>{await gate;await route.continue();});
 const widths=()=>page.evaluate(()=>[document.querySelector('.sidebar')!,document.querySelector('#files-sidebar')!].map(node=>node.getBoundingClientRect().width));
 try{
  await page.goto('/',{waitUntil:'commit'});
  await page.waitForFunction(()=>document.querySelector('.sidebar')&&getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim());
  expect(await widths()).toEqual([312,0]);expect(await page.locator('.panel-resizer').count()).toBe(0);
  expect(await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');
 }finally{release();}
 await expect(page.getByRole('separator',{name:'Resize workspace sidebar'})).toBeVisible();expect(await widths()).toEqual([312,0]);
 await expect(page.locator('.topbar').getByRole('button',{name:'New session',exact:true})).toBeVisible();await expect(page.locator('.sidebar').getByRole('button',{name:'New session',exact:true})).toHaveCount(0);
 await expect(page.locator('html')).toHaveAttribute('data-layout-ready','true');
 expect(await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).transitionDuration)).not.toBe('0s');
 await page.getByRole('button',{name:'Toggle files',exact:true}).click();await expect.poll(widths).toEqual([312,334]);
 const handle=page.getByRole('separator',{name:'Resize workspace sidebar'});await handle.press('ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow','322');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('ai-web.left-panel-width'))).toBe('322');await page.reload();await expect(handle).toHaveAttribute('aria-valuenow','322');expect(await widths()).toEqual([322,334]);
 await handle.press('Home');await expect.poll(async()=>Math.abs((await widths())[0]-1440*.18)).toBeLessThan(1);
 expect(await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).transitionDuration)).not.toBe('0s');
});
test('default sidebars use equal fixed proportions',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'New session',exact:true})).toBeVisible();
 const widths=await page.locator('.sidebar,#files-sidebar').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));expect(Math.abs(widths[0]-widths[1])).toBeLessThan(1);expect(Math.abs(widths[0]-1440*.18)).toBeLessThan(1);
});
