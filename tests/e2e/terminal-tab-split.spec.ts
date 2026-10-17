import {test,expect} from '@playwright/test';

test('dragging a tab onto the open terminal pane splits it on the dropped side',async({page})=>{
 const project={id:'drop-test',name:'Drop test',root:'C:\work\drop'};
 await page.addInitScript(()=>localStorage.setItem('ai-web.auto-split-terminals','false'));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',socket=>socket.onMessage(raw=>{const message=JSON.parse(raw.toString());if(message.type==='start')socket.send(JSON.stringify({type:'ready',shell:'Test shell'}));}));
 await page.goto('/');
 for(let i=0;i<2;i++){await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();}
 const panes=page.locator('.terminal-screen:visible');await expect(panes).toHaveCount(1);
 const tabs=page.locator('#terminal-tabs .terminal-tab');await expect(tabs).toHaveCount(2);
 await tabs.first().dragTo(panes.first(),{targetPosition:{x:20,y:300}});
 await expect(panes).toHaveCount(2);
 await expect(page.locator('.terminal-split-right')).toHaveCount(1);
});

test('dragging the open tab onto its own pane splits it with the previous tab on the opposite side',async({page})=>{
 const project={id:'drop-test',name:'Drop test',root:'C:\work\drop'};
 await page.addInitScript(()=>localStorage.setItem('ai-web.auto-split-terminals','false'));
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));
 await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));
 await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));
 await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.routeWebSocket('**/api/terminal',socket=>socket.onMessage(raw=>{const message=JSON.parse(raw.toString());if(message.type==='start')socket.send(JSON.stringify({type:'ready',shell:'Test shell'}));}));
 await page.goto('/');
 for(let i=0;i<2;i++){await page.locator('#terminal-new').click();await page.locator('[data-launch=shell]').click();}
 const panes=page.locator('.terminal-screen:visible');await expect(panes).toHaveCount(1);
 const tabs=page.locator('#terminal-tabs .terminal-tab');

 await tabs.nth(1).dragTo(panes.first(),{targetPosition:{x:20,y:300}});
 await expect(panes).toHaveCount(2);
 await expect(panes.first()).toHaveAttribute('id',await tabs.nth(1).getAttribute('data-session-id').then(id=>`terminal-screen-${id}`));
});
