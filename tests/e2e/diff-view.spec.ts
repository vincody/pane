import {test,expect,type Page} from '@playwright/test';
const original=Array.from({length:40},(_,index)=>`export function item${index}(value: number) {\n  return value + ${index};\n}\n`).join('\n');
const modified=original.replace('return value + 5;','return value * 5;').replace('return value + 30;','return Math.max(value, 30);');
async function open(page:Page){
 const project={id:'diff-view',name:'Diff view',root:'C:\\work\\diff',branch:'main'};
 await page.addInitScript(()=>{document.hasFocus=()=>true;});
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:true,files:[{path:'src/utils.ts',added:2,removed:2,binary:false}],statuses:{'src/utils.ts':{code:' M'}}}}));
 await page.route('**/api/diff?**',route=>route.fulfill({json:{original,modified,baseline:true}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,rows:[]}}));await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.goto('/');await page.getByRole('tab',{name:/Changes/}).click();await page.getByRole('button',{name:'View diff: src/utils.ts'}).click();
 await expect(page.locator('.monaco-diff-editor')).toBeVisible();
}
test('the diff pane header shows the file, its folder and the line totals',async({page})=>{
 await open(page);
 const pane=page.locator('.file-layout-pane').filter({has:page.locator('.diff-file')});
 await expect(pane.locator('.diff-file')).toHaveText('utils.ts');await expect(pane.locator('.diff-folder')).toHaveText('src');
 await expect(pane.locator('.diff-added')).toHaveText('+2');await expect(pane.locator('.diff-removed')).toHaveText('−2');
});
test('unchanged regions are folded by default and can be shown, with the choice remembered',async({page})=>{
 await open(page);
 const fold=page.getByRole('button',{name:'Show all lines'});await expect(fold).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText(/\d+ hidden lines/).first()).toBeVisible();
 await fold.click();await expect(page.getByRole('button',{name:'Hide unchanged regions'})).toHaveAttribute('aria-pressed','false');
 await expect(page.getByText(/\d+ hidden lines/)).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ai-web.diff-view')||'{}'))).toMatchObject({hideUnchanged:false});
 await page.reload();await page.getByRole('tab',{name:/Changes/}).click();await page.getByRole('button',{name:'View diff: src/utils.ts'}).click();
 await expect(page.locator('.monaco-diff-editor')).toBeVisible();await expect(page.getByRole('button',{name:'Hide unchanged regions'})).toHaveAttribute('aria-pressed','false');
});
test('the layout switch toggles between split and unified and the change buttons are available',async({page})=>{
 await open(page);
 const splitColumns=()=>page.locator('.monaco-diff-editor .editor.original').count();
 expect(await splitColumns()).toBe(1);
 await page.getByRole('button',{name:'Unified view'}).click();await expect(page.getByRole('button',{name:'Split view'})).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.locator('.monaco-diff-editor.side-by-side').count()).toBe(0);
 await page.getByRole('button',{name:'Next change'}).click();await page.getByRole('button',{name:'Previous change'}).click();
 await page.getByRole('button',{name:'Split view'}).click();await expect.poll(()=>page.locator('.monaco-diff-editor.side-by-side').count()).toBe(1);
});
