const assert = require('node:assert/strict');
const {chromium}=require('C:/Users/aidy6/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'C:/Users/aidy6/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
 const context=await b.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:60.7945,longitude:11.0679}});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:3000/discover',{waitUntil:'networkidle'});
 const consent=p.getByRole('button',{name:'Kun nødvendige',exact:true});if(await consent.isVisible())await consent.click();
 assert(await p.locator('.discover-card').count()>0);
 assert.equal(await p.locator('#discover-filter-fields').isVisible(),false);
 await p.locator('.discover-filter-toggle').click();assert(await p.locator('#discover-filter-fields').isVisible());
 await p.locator('input[name=maxPrice]').fill('800');
 await p.locator('.discover-apply').click();await p.waitForURL('**maxPrice=800**');await p.waitForLoadState('networkidle');
 assert.equal(new URL(p.url()).searchParams.get('maxPrice'),'800');
 assert.equal(await p.locator('.discover-filter-toggle').getAttribute('aria-expanded'),'false');
 for(const price of await p.locator('.discover-card-footer strong').allTextContents())assert(Number(price.replace(/[^0-9]/g,''))<=800);
 console.log('PASS mobile filter submission and matching prices');
 await p.locator('.discover-sort select').selectOption('price');await p.waitForURL('**sort=price**');await p.waitForLoadState('networkidle');
 assert.equal(new URL(p.url()).searchParams.get('maxPrice'),'800');
 for(const section of await p.locator('.discover-result-section').all()){const prices=(await section.locator('.discover-card-footer strong').allTextContents()).map(v=>Number(v.replace(/[^0-9]/g,'')));assert.deepEqual(prices,[...prices].sort((a,b)=>a-b));}
 console.log('PASS sorting retains filters and orders prices');
 await p.locator('.discover-categories a').filter({hasText:'Nettkurs'}).click();await p.waitForURL('**type=online**');await p.waitForLoadState('networkidle');
 assert.equal(new URL(p.url()).searchParams.get('maxPrice'),'800');assert.equal(await p.locator('.discover-card-trainer').count(),0);
 await p.locator('.discover-active-filters a[aria-label]').first().click();await p.waitForURL(url=>!url.searchParams.has('maxPrice'));await p.waitForLoadState('networkidle');assert.equal(new URL(p.url()).searchParams.get('maxPrice'),null);
 console.log('PASS category changes preserve filters; individual removal works');
 await p.goto('http://localhost:3000/discover?q=zzzzdoesnotexist',{waitUntil:'networkidle'});assert.equal(await p.locator('.discover-empty').count(),1);
 await p.locator('.discover-active-filters a[aria-label]').first().click();await p.waitForURL('http://localhost:3000/discover');assert.equal(await p.locator('input[name=q]').inputValue(),'');
 console.log('PASS empty state and reset synchronize search input');
 await p.locator('.discover-filter-toggle').click();await p.getByRole('button',{name:'Bruk min posisjon',exact:true}).click();await p.waitForFunction(()=>document.querySelector('input[name=lat]').value!=='');
 await p.locator('.discover-apply').click();await p.waitForURL('**lat=**');await p.waitForLoadState('networkidle');assert(new URL(p.url()).searchParams.get('lng'));assert.equal(await p.locator('option[value=nearest]').isDisabled(),false);
 console.log('PASS geolocation submission enables distance sorting');
 await p.goto('http://localhost:3000/discover?type=activities',{waitUntil:'networkidle'});assert.equal(await p.locator('.discover-categories [aria-current=page]').count(),1);
 const save=p.locator('.discover-card .save-button').first();await save.click();await p.waitForURL('**/login?next=**');assert(new URL(p.url()).searchParams.get('next').includes('type=activities'));
 console.log('PASS activity category and saved-item login return path');
 for(const width of [1440,390,320]){await p.setViewportSize({width,height:950});await p.goto('http://localhost:3000/discover',{waitUntil:'networkidle'});await p.screenshot({path:`.review/discover-final-${width}.png`,fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('PASS no page errors or horizontal overflow');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
