const fs=require('fs'),assert=require('node:assert/strict'),{renderToStaticMarkup}=require('react-dom/server');
const {load,fixtures}=require('./customer-fixtures.cjs');
const {chromium}=require('C:/Users/aidy6/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Users/aidy6/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});try{const p=await b.newPage();
await p.goto('http://localhost:3000/personvern',{waitUntil:'networkidle'});
for(const width of [1440,390,320]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'public overflow '+width);}
assert.equal(await p.locator('.privacy-nav a').count(),6);
const css=['app/globals.css','app/refinements.css','app/ui.css','components/customer-pages.css'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
for(const state of ['none','pending','requires_review']){fixtures.account_deletion_requests=state==='none'?[]:[{user_id:'user',status:state,scheduled_for:'2026-10-14T12:00:00Z'}];const markup=renderToStaticMarkup(await load('app/account/privacy/page.tsx').default({searchParams:Promise.resolve({})}));await p.setContent('<style>'+css+'</style>'+markup);for(const width of [1440,390,320]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'account overflow '+state+' '+width);}assert.equal(await p.locator('input[type=checkbox]').count(),3);assert.equal(await p.locator('a[href="/account/privacy/export"]').count(),1);if(state!=='none')assert.equal(await p.getByRole('button',{name:'Avbryt kontosletting'}).count(),1);}
console.log('PASS: public privacy and account privacy at 1440/390/320px; normal and pending deletion states rendered. No account actions submitted.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
