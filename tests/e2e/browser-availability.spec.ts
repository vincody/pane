import {test,expect} from '@playwright/test';
test('the regular web app does not offer the Browser tab, only the desktop app does',async({page})=>{
 const project={id:'browser-availability',name:'Browser availability',root:'C:\work\browser',branch:'main'};
 await page.route('**/api/projects',route=>route.fulfill({json:{projects:[project],defaultProject:project.id}}));
 await page.route('**/api/tree?**',route=>route.fulfill({json:{entries:[]}}));await page.route('**/api/changes?**',route=>route.fulfill({json:{available:false,files:[]}}));await page.route('**/api/account-usage?**',route=>route.fulfill({json:{providers:[]}}));await page.route('**/api/dev-servers?**',route=>route.fulfill({json:{available:true,rows:[]}}));await page.route('**/api/local-sessions',route=>route.fulfill({json:{agents:[],sessions:[]}}));
 await page.goto('/');await page.locator('#terminal-new').click();
 await expect(page.locator('#terminal-launcher [data-launch]')).toHaveCount(4);
 await expect(page.locator('#terminal-launcher [data-launch=browser]')).toHaveCount(0);
});
