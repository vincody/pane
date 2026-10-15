import {test,expect} from '@playwright/test';

for(const kind of ['pulls','issues'] as const)test(`${kind} list and context render independently when either request is slow`,async({page})=>{
 const project={id:'loading-repo',name:'Pane',root:'C:\\work\\pane',branch:'feature'};
 let releaseContext!:()=>void,releaseList!:()=>void,holdList=false,listCalls=0;
 const contextReady=new Promise<void>(resolve=>{releaseContext=resolve;}),listReady=new Promise<void>(resolve=>{releaseList=resolve;});
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/github/context?**',async route=>{await contextReady;await route.fulfill({json:{available:true,repository:{name:'acme/pane',defaultBranch:'main'},branch:'feature',head:'a'.repeat(40),headBranch:'feature',canCreate:true,bases:['main'],dirty:false}});});
 await page.route(`**/api/github/${kind}?**`,async route=>{listCalls++;if(holdList)await listReady;await route.fulfill({json:{items:[{number:8,title:'Visible before repository check',body:'',state:'open',url:'https://github.com/acme/pane/pull/8',author:'tester',updatedAt:'2026-10-15T00:00:00Z',labels:[]}],limited:false}});});
 await page.goto('/');await page.getByRole('button',{name:'Git',exact:true}).click();const dialog=page.getByRole('tabpanel',{name:'Git · Pane',exact:true});await dialog.getByRole('tab',{name:kind==='pulls'?'Pull requests':'Issues',exact:true}).click();
 await expect(dialog.getByRole('button',{name:/Visible before repository check/})).toBeVisible();if(kind==='pulls')await expect(dialog.getByRole('button',{name:'New draft PR',exact:true})).toBeDisabled();await expect(dialog).not.toContainText('Connecting to GitHub');
 releaseContext();await expect(dialog.locator('.github-toolbar strong')).toHaveText('acme/pane');
 holdList=true;await dialog.getByRole('button',{name:'Refresh',exact:true}).click();await expect(dialog.getByRole('button',{name:'Refresh',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:/Visible before repository check/})).toBeVisible();await expect(dialog.locator('.github-toolbar strong')).toHaveText('acme/pane');releaseList();await expect(dialog.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();const before=listCalls;await dialog.getByRole('tab',{name:'Graph',exact:true}).click();await dialog.getByRole('tab',{name:kind==='pulls'?'Pull requests':'Issues',exact:true}).click();await expect(dialog.getByRole('button',{name:/Visible before repository check/})).toBeVisible();expect(listCalls).toBe(before);
});

test('Issue description is immediately usable while its detail request is slow, and survives timeout',async({page})=>{
 const project={id:'issue-details',name:'Pane',root:'C:\\work\\pane',branch:'main'};
 const issue={number:8,title:'Issue with slow detail request',body:'## Steps\n\nContent from the issue list.',state:'open',url:'https://github.com/acme/pane/issues/8',author:'tester',updatedAt:'2026-10-15T00:00:00Z',labels:[]};
 let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/github/context?**',route=>route.fulfill({json:{available:true,repository:{name:'acme/pane'},canCreate:false}}));
 await page.route('**/api/github/issues?**',route=>route.fulfill({json:{items:[issue],limited:false}}));
 await page.route('**/api/github/issue?**',async route=>{await blocked;await route.fulfill({json:issue}).catch(()=>{});});
 await page.goto('/');await page.getByRole('button',{name:'Git',exact:true}).click();const dialog=page.getByRole('tabpanel',{name:'Git · Pane',exact:true});await dialog.getByRole('tab',{name:'Issues',exact:true}).click();await page.clock.install();await dialog.getByRole('button',{name:/Issue with slow detail/}).click();
 await expect(dialog.getByRole('heading',{name:'Steps',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Start working',exact:true})).toBeEnabled();await expect(dialog).not.toContainText('Loading details');await page.clock.fastForward(12_001);await expect(dialog.getByRole('alert')).toContainText('took too long');await expect(dialog).toContainText('Content from the issue list.');release();
});
