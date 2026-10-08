const {chromium}=require('C:/Users/aidy6/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/aidy6/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
 try {
 const page=await browser.newPage();
 let requests=[];
 await page.route('**/api/newsletter/subscribe',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}})});
 await page.goto('http://localhost:3000',{waitUntil:'networkidle'});
 const consent=page.getByRole('button',{name:'Kun nødvendige',exact:true});if(await consent.isVisible())await consent.click();
 const forms=page.locator('form.newsletter-signup');assert.equal(await forms.count(),2);
 for(const width of [1440,390,320]) {
 await page.setViewportSize({width,height:900});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
 for(let i=0;i<2;i++) {const form=forms.nth(i);await form.locator('[name=name]').fill('Åse Ødegård');await form.locator('[name=email]').fill('test@example.com');await form.getByRole('button',{name:'Meld meg på',exact:true}).click();await form.getByRole('status').filter({hasText:'Du er på listen'}).waitFor();assert.equal(await form.locator('[name=name]').inputValue(),'');}
 }
 assert.equal(requests.length,6);assert.ok(requests.every(r=>r.name==='Åse Ødegård'&&r.email==='test@example.com'));
 console.log('PASS: both homepage forms submit name + email, reset on success, no overflow at 1440/390/320px. Requests mocked.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
