const {chromium}=require('C:/Users/aidy6/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/aidy6/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:3000/trainers/carina-test',{waitUntil:'networkidle'});
const consent=page.getByRole('button',{name:'Kun nødvendige',exact:true}); if(await consent.isVisible()) await consent.click();
const routes=await page.locator('.tp-slot-heading a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))); assert(routes.length);
for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000}); const r=await page.goto('http://localhost:3000'+routes[0],{waitUntil:'networkidle'}); assert.equal(r.status(),200); assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); await page.screenshot({path:'.review/booking-'+width+'.png',fullPage:true});}
assert.equal(await page.locator('.pb-times a[aria-current=true]').count(),1);
const href=await page.locator('.pb-times a').first().getAttribute('href'); const slot=new URL(href,'http://localhost').searchParams.get('slot');
await page.locator('.pb-times a').first().click(); await page.waitForURL('**'+href);
const numbers=await page.locator('.pb-price-lines dd').allTextContents(); assert.equal(Number(numbers.at(-1).replace(/\D/g,'')),numbers.slice(0,-1).reduce((sum,s)=>sum+Number(s.replace(/\D/g,'')),0));
await page.locator('.pb-promo summary').click(); await page.locator('#booking-promo').fill('INVALID-BOOKING-REVIEW'); await page.locator('.pb-promo button').click(); await page.waitForURL('**promo=INVALID-BOOKING-REVIEW'); assert.equal(new URL(page.url()).searchParams.get('slot'),slot); assert.equal(await page.locator('.pb-code-error').count(),1);
const login=await page.locator('.pb-account-actions a').first().getAttribute('href'); const next=new URL(login,'http://localhost').searchParams.get('next'); assert.equal(new URL(next,'http://localhost').searchParams.get('slot'),slot); assert.equal(new URL(next,'http://localhost').searchParams.get('promo'),'INVALID-BOOKING-REVIEW');
await page.locator('.pb-remove-promo').click(); await page.waitForURL(u=>!u.searchParams.has('promo')); assert.equal(new URL(page.url()).searchParams.get('slot'),slot);
await page.goto('http://localhost:3000'+routes[0]+'?slot=00000000-0000-0000-0000-000000000000',{waitUntil:'networkidle'}); assert.equal(await page.locator('.pb-availability .pb-error').count(),1); assert.equal(await page.locator('.pb-account-actions').count(),0); await page.locator('.pb-times a').first().click(); await page.waitForURL(u=>u.searchParams.get('slot')===slot); await page.locator('.pb-account-actions').waitFor();
for(const route of routes){await page.goto('http://localhost:3000'+route,{waitUntil:'networkidle'}); console.log(route,await page.locator('.pb-mode').innerText());}
assert.deepEqual(errors,[]); console.log('PASS responsive widths, time selection, totals, promo state, login return state, unavailable slot recovery; no browser errors'); await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
