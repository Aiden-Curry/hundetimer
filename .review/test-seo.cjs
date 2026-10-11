const assert=require('node:assert/strict');
const {load,overrides}=require('./customer-fixtures.cjs');
const seo=load('lib/seo.ts');
for(const p of ['/admin','/account/privacy','/api/test','/learn/x','/vilkar/treneravtale','/payout-statements/x'])assert(seo.isPrivatePath(p));
for(const p of ['/','/discover','/activities/x','/trainers/test','/vilkar','/online-courses/x'])assert(!seo.isPrivatePath(p));
let fail=false;const queries=[];
const trainers=Array.from({length:501},(_,i)=>({id:'t'+i,slug:'trainer-'+i}));
overrides['@supabase/supabase-js']={createClient:()=>({
 from(table){let flag,start,end;return {
 select(){return this},eq(key,value){assert.equal(value,true);flag=key;return this},order(){return this},
 range(a,b){start=a;end=b;return this},
 async abortSignal(){queries.push([table,flag,start]);if(fail)return {data:null,error:{message:'offline'}};
 const data=table==='trainer_profiles'?trainers:table==='group_offerings'?[{id:'a',trainer_id:'t0'},{id:'hidden',trainer_id:'unverified'}]:[{id:'c',slug:'course',trainer_id:'t0'},{id:'hidden',slug:'hidden',trainer_id:'unverified'}];
 return {data:data.slice(start,end+1),error:null};}
 };}
})};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test';
(async()=>{const sitemap=load('app/sitemap.ts').default;const result=await sitemap();assert.equal(result.length,510);assert(result.every(x=>x.url.startsWith(seo.SITE_URL)));assert(!result.some(x=>x.url.includes('hidden')));assert(queries.some(x=>x[0]==='trainer_profiles'&&x[2]===500));assert.equal(load('app/robots.ts').default().sitemap,'https://hundetimer.no/sitemap.xml');fail=true;assert.equal((await sitemap()).length,7);console.log('PASS private/public boundaries, robots, paginated public listings, verified-trainer filtering and outage fallback.');})().catch(e=>{console.error(e);process.exitCode=1});
