import {test,expect} from '@playwright/test';

test('declining notification permission leaves loyalty available',async({page,context})=>{
 const cdp=await context.newCDPSession(page);
 await cdp.send('Browser.setPermission',{permission:{name:'notifications'},setting:'denied',origin:'http://127.0.0.1:3100'});
 await page.goto('/ui-fixtures/phase2?form=push');
 await page.getByRole('button',{name:'Enable notifications'}).click();
 await expect(page.getByRole('status')).toContainText('Notifications are off. You can still use all your loyalty cards.');
 await expect(page.getByRole('button',{name:'Enable notifications'})).toBeEnabled();
 await page.goto('/app');
 await expect(page.getByText('This development environment is not connected to authentication yet.',{exact:false})).toBeVisible();
});
