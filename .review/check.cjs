const { chromium } = require('C:/Users/aidy6/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:"C:/Users/aidy6/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"});
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 for (const width of [1440, 768, 390, 320]) {
  await page.setViewportSize({width,height:900});
  await page.goto('http://localhost:3000', {waitUntil:'networkidle'});
  await page.screenshot({path:`.review/home-${width}.png`,fullPage:true});
  console.log(JSON.stringify({route:'/',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),images:await page.locator('main img').evaluateAll(imgs=>imgs.map(i=>({loaded:i.complete && i.naturalWidth>0,src:i.getAttribute('alt')})))}));
  if(width===390){
   await page.getByRole('button',{name:'Meny',exact:true}).click();
   await page.getByRole('navigation',{name:'Hovedmeny'}).waitFor({state:'visible'});
   await page.screenshot({path:'.review/mobile-menu.png'});
   await page.keyboard.press('Escape');
   console.log('Menu escape closed:',await page.getByRole('button',{name:'Meny',exact:true}).getAttribute('aria-expanded'));
  }
 }
 for(const route of ['/discover','/discover?type=activities','/online-courses','/login','/register','/register?role=trainer','/account','/trainer-dashboard']) {
  await page.setViewportSize({width:390,height:844});
  const response=await page.goto('http://localhost:3000'+route,{waitUntil:'networkidle'});
  console.log(JSON.stringify({route,status:response.status(),url:page.url(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),heading:await page.locator('h1').allTextContents()}));
  await page.screenshot({path:'.review/'+route.replace(/[^a-z0-9]/gi,'_')+'.png',fullPage:true});
 }
 console.log('Page errors:',errors);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
