const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
const assert = require('node:assert/strict');
let saved, existing = null;
const admin = {from() { return {select(){return this},eq(){return this},ilike(){return this},maybeSingle:async()=>({data:existing}),insert:async(row)=>{saved=row;return {error:null}},update(row){saved=row;return {eq:async()=>({error:null})}}}; }};
const code = ts.transpileModule(fs.readFileSync('app/api/newsletter/subscribe/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const routeExports = {};
vm.runInNewContext(code,{exports:routeExports,require(id){if(id==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};if(id.includes('/admin'))return {createAdminClient:()=>admin};if(id.includes('/server'))return {createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})};throw Error(id)}});
(async()=>{
 for(const name of ['', '   ', 'x'.repeat(101), 123]) {saved=null;const result=await routeExports.POST({json:async()=>({email:'test@example.com',name})});assert.equal(result.status,400);assert.equal(saved,null);}
 let result=await routeExports.POST({json:async()=>({email:' TEST@example.com ',name:'  Åse Ødegård  '})});assert.equal(result.status,200);assert.equal(saved.name,'Åse Ødegård');assert.equal(saved.email,'test@example.com');
 existing={id:'existing',user_id:null,name:'Old name'};await routeExports.POST({json:async()=>({email:'test@example.com',name:'New name'})});assert.equal(saved.name,'New name');
 existing={id:'protected',user_id:'another-user'};saved=null;await routeExports.POST({json:async()=>({email:'test@example.com',name:'Changed'})});assert.equal(saved,null);
 console.log('PASS: name validation, trimmed name storage, existing subscription update, account protection. All database writes mocked.');
})().catch(error=>{console.error(error);process.exitCode=1});

