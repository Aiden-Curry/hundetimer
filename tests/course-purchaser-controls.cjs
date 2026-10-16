const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, overrides } = require('../.review/customer-fixtures.cjs');
let userId='trainer', createCalls=0, emailCalls=[], failCreate=false, refundState='succeeded', failFinalize=false;
let rows, refunds;
function reset(ledgerStatus='eligible') {
  rows={online_courses:[{id:'course',trainer_id:'trainer',title:'Valpekurs'}],
    online_course_purchases:[{id:'purchase',course_id:'course',customer_id:'customer',dog_name:'Luna',status:'active',payment_status:'captured',stripe_payment_intent_id:'pi',subtotal_nok:900,service_fee_nok:29,access_version:0,access_revoked_at:null}],
    online_course_progress:[{purchase_id:'purchase',lesson_id:'lesson',completed_at:'2026-10-15T12:00:00Z'}],
    online_course_modules:[{id:'module',title:'Grunnlag',position:0}],online_course_lessons:[{id:'lesson',course_id:'course',module_id:'module',position:0,title:'Kontakt'}],
    online_course_lesson_content:[{lesson_id:'lesson',video_path:'trainer/video.mp4',attachment_path:'trainer/file.pdf'}],
    trainer_ledger:[{id:'earning',online_course_purchase_id:'purchase',entry_type:'earning',amount_nok:832,status:ledgerStatus}],
    online_course_purchase_events:[],notifications:[]};
  refunds=[];createCalls=0;emailCalls=[];failCreate=false;failFinalize=false;refundState='succeeded';userId='trainer';
}
const purchase=()=>rows.online_course_purchases[0];
function query(table) {
  let filters=[],single=false,op='select',payload;
  const q=new Proxy({}, {get(_,method){
    if(method==='then')return resolve=>{
      const all=rows[table]||=[];let result=all.filter(r=>filters.every(fn=>fn(r)));
      if(op==='update')result.forEach(r=>Object.assign(r,payload));
      if(op==='upsert'||op==='insert'){
        result=[];
        const duplicate=op==='upsert'&&all.find(r=>r.user_id===payload.user_id&&r.event_key===payload.event_key);
        if(!duplicate){const row={id:'row'+all.length,...payload};all.push(row);result.push(row);}
      }
      resolve({data:single?result[0]||null:result,error:null});
    };
    return (...args)=>{
      if(['update','insert','upsert'].includes(method)){op=method;payload=args[0];}
      if(method==='eq')filters.push(r=>r[args[0]]===args[1]);
      if(method==='in')filters.push(r=>args[1].includes(r[args[0]]));
      if(method==='is')filters.push(r=>(r[args[0]]??null)===args[1]);
      if(['single','maybeSingle'].includes(method))single=true;
      return q;
    };
  }});return q;
}
function event(key,kind,reason=null){if(!rows.online_course_purchase_events.some(e=>e.event_key===key))rows.online_course_purchase_events.push({event_key:key,purchase_id:'purchase',kind,reason});}
const db={from:query,storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://private-storage.test/media'}})})},auth:{getUser:async()=>({data:{user:{id:userId}}}),admin:{getUserById:async()=>({data:{user:{email:'customer@test.invalid'}}})}},
  rpc:async(name,args)=>{
    const p=purchase();
    if(name==='set_online_course_purchase_access'){
      if(userId!=='trainer'||p.status!=='active'||p.payment_status!=='captured')return {error:Error('not allowed')};
      const kind=args.p_revoke?'revoked':'restored';
      if(Boolean(p.access_revoked_at)!==args.p_revoke){p.access_revoked_at=args.p_revoke?'2026-10-16T12:00:00Z':null;p.access_revoked_by=args.p_revoke?userId:null;p.access_revoked_reason=args.p_revoke?args.p_reason:null;p.access_version++;}
      const key=`course-access-${kind}/purchase/${p.access_version}`;event(key,kind,p.access_revoked_reason);return {data:{event_key:key}};
    }
    if(name==='system_claim_online_course_refund'){
      if(p.refund_locked_until)return {data:false};p.refund_locked_until='locked';return {data:true};
    }
    if(name==='system_finalize_online_course_refund'){
      if(failFinalize)throw Error('DB unavailable');
      if(p.stripe_refund_id && p.stripe_refund_id!==args.p_refund_id && p.refund_status!=='failed')return {error:Error('Refusjonen tilhører ikke kjøpet.')};
      if(p.payment_status==='refunded')return {error:null};
      p.stripe_refund_id=args.p_refund_id;p.refund_status=args.p_refund_status;p.refund_locked_until=null;
      if(args.p_refund_status==='succeeded'){
        p.payment_status=p.status='refunded';p.refunded_at='2026-10-16T12:00:00Z';
        const earning=rows.trainer_ledger[0];
        if(earning.status==='eligible')earning.status='reversed';
        else if(['paid','batched'].includes(earning.status)&&!rows.trainer_ledger.some(l=>l.entry_type==='adjustment'))rows.trainer_ledger.push({entry_type:'adjustment',amount_nok:-earning.amount_nok,status:'eligible'});
        event('course-refunded/purchase','refunded');
      }
      return {error:null};
    }
    if(name==='system_claim_course_event_email'){
      const e=rows.online_course_purchase_events.find(e=>e.event_key===args.p_event_key);if(e.email_sent_at||e.email_locked_until)return {data:false};e.email_locked_until='locked';return {data:true};
    }
    if(name==='trainer_online_course_customer_names')return {data:[{customer_id:'customer',display_name:'Kari'}]};
    throw Error('Unexpected RPC '+name);
  }};
overrides['@/lib/supabase/server']={createClient:async()=>db};overrides['@/lib/supabase/admin']={createAdminClient:()=>db};
overrides['@/lib/trainer-journey-server']={getTrainerJourney:async()=>({stage:userId==='customer'?'owner':'ready'})};
overrides['@/lib/email/server']={sendTransactionalEmail:async options=>{emailCalls.push(options);return {skipped:false,id:'email'};}};
const stripe={refunds:{
  list:async()=>({data:refunds}),retrieve:async id=>{const r=refunds.find(r=>r.id===id);if(!r)throw Error('Missing Stripe refund');return r;},
  create:async(options,requestOptions)=>{
    createCalls++;assert.equal(options.payment_intent,'pi');assert.equal(options.amount,92900);assert.equal(requestOptions.idempotencyKey,'online-course-full-refund/purchase');
    if(failCreate)throw Error('Stripe unavailable');
    const r={id:'refund',metadata:options.metadata,payment_intent:'pi',amount:options.amount,currency:'nok',status:refundState};refunds.push(r);return r;
  }},webhooks:{constructEvent:body=>JSON.parse(body)}};
overrides['@/lib/stripe/server']={getStripe:()=>stripe};
overrides['@/lib/notifications/server']=load('lib/notifications/server.ts');
overrides['@/lib/email/course-purchase-events']=load('lib/email/course-purchase-events.ts');
const refundModule=load('lib/stripe/online-course-refunds.ts');overrides['@/lib/stripe/online-course-refunds']=refundModule;
const {manageCoursePurchaserAction:action}=load('app/trainer-dashboard/online-courses/purchaser-actions.ts');
const {hasPaidCourseAccess}=load('lib/course-learning.ts');
const {TrainerCourseStudents}=load('components/trainer-course-students.tsx');
const form=(operation,reason='')=>{const f=new FormData();f.set('purchaseId','purchase');f.set('operation',operation);f.set('reason',reason);return f;};
const render=async()=>renderToStaticMarkup(await TrainerCourseStudents({course:rows.online_courses[0],modules:rows.online_course_modules,lessons:rows.online_course_lessons}));
const originalError=console.error;
(async()=>{
  process.env.RESEND_API_KEY='mock';process.env.STRIPE_WEBHOOK_SECRET='mock';
  reset();const originalProgress=JSON.stringify(rows.online_course_progress),originalLedger=JSON.stringify(rows.trainer_ledger);
  assert.equal((await action(form('revoke','Brudd på vilkår'))).ok,true);
  assert.equal(createCalls,0);assert.equal(purchase().payment_status,'captured');assert.equal(purchase().access_revoked_by,'trainer');assert.equal(hasPaidCourseAccess(purchase()),false);
  assert.equal(JSON.stringify(rows.trainer_ledger),originalLedger);assert.equal(JSON.stringify(rows.online_course_progress),originalProgress);
  let html=await render();for(const text of ['Tilgang fjernet','Brudd på vilkår','Gjenopprett tilgang','1 av 1 leksjoner'])assert.ok(html.includes(text),text);
  assert.equal(rows.notifications.length,1);assert.equal(emailCalls.length,1);
  await action(form('revoke','Brudd på vilkår'));assert.equal(rows.notifications.length,1);assert.equal(emailCalls.length,1);
  assert.equal((await action(form('restore'))).ok,true);assert.equal(hasPaidCourseAccess(purchase()),true);assert.equal(purchase().access_revoked_at,null);
  assert.equal(JSON.stringify(rows.online_course_progress),originalProgress);assert.equal(JSON.stringify(rows.trainer_ledger),originalLedger);assert.equal(createCalls,0);assert.equal(rows.notifications.length,2);
  userId='other-trainer';for(const op of ['refund','revoke','restore'])assert.equal((await action(form(op))).ok,false);
  userId='customer';for(const op of ['refund','revoke','restore'])assert.equal((await action(form(op))).ok,false);assert.equal(createCalls,0);
  console.log('PASS revoke/restore owner authorization, optional reason, preserved progress/payment/ledger, zero Stripe calls, deduplicated notifications/email and trainer history');

  for(const ledgerStatus of ['eligible','batched','paid']){
    reset(ledgerStatus);assert.equal((await action(form('refund'))).ok,true);assert.equal(createCalls,1);assert.equal(hasPaidCourseAccess(purchase()),false);assert.equal(purchase().status,'refunded');assert.ok(purchase().refunded_at);
    await action(form('refund'));await refundModule.syncOnlineCourseRefund('refund');assert.equal(createCalls,1);assert.equal(rows.notifications.length,1);assert.equal(emailCalls.length,1);
    if(ledgerStatus==='eligible'){assert.equal(rows.trainer_ledger[0].status,'reversed');assert.equal(rows.trainer_ledger.length,1);}else{assert.equal(rows.trainer_ledger[0].status,ledgerStatus);assert.equal(rows.trainer_ledger.length,2);assert.equal(rows.trainer_ledger[1].amount_nok,-832);}
    html=await render();assert.match(html,/Refundert:/);assert.match(html,/0 aktive/);assert.doesNotMatch(html,/Gjenopprett tilgang|Refunder kjøp/);
    console.error=()=>{};assert.equal((await action(form('restore'))).ok,false);console.error=originalError;
  }
  console.log('PASS full Stripe refund exactly once; success-only access/payment changes; eligible reversal and single paid/batched adjustment; receipt/email; refunded history and no restore');

  for(const ledgerStatus of ['eligible','batched','paid']){
    reset(ledgerStatus);refundState='failed';
    await action(form('refund'));
    assert.equal(purchase().stripe_refund_id,'refund');assert.equal(purchase().refund_status,'failed');
    assert.equal(purchase().payment_status,'captured');assert.equal(rows.trainer_ledger.length,1);assert.equal(rows.trainer_ledger[0].status,ledgerStatus);
    // A new refund returned by Stripe on retry reaches the same sync/finalizer path.
    refunds.push({...refunds[0],id:'refund-retry',status:'succeeded'});
    await refundModule.syncOnlineCourseRefund('refund-retry');
    await refundModule.syncOnlineCourseRefund('refund-retry');
    assert.equal(purchase().stripe_refund_id,'refund-retry');assert.equal(purchase().status,'refunded');assert.equal(purchase().payment_status,'refunded');
    if(ledgerStatus==='eligible'){assert.equal(rows.trainer_ledger[0].status,'reversed');assert.equal(rows.trainer_ledger.length,1);}
    else{assert.equal(rows.trainer_ledger[0].status,ledgerStatus);assert.equal(rows.trainer_ledger.length,2);assert.equal(rows.trainer_ledger[1].amount_nok,-832);}
    assert.equal(rows.notifications.length,1);assert.equal(emailCalls.length,1);
    // A completed purchase must still reject a different refund ID.
    await assert.rejects(refundModule.syncOnlineCourseRefund('refund'),/tilhører ikke/);
  }
  for(const previousStatus of ['pending','succeeded',null]){
    reset();purchase().stripe_refund_id='original';purchase().refund_status=previousStatus;
    refunds.push({id:'different',metadata:{online_course_purchase_id:'purchase'},payment_intent:'pi',amount:92900,currency:'nok',status:'succeeded'});
    await assert.rejects(refundModule.syncOnlineCourseRefund('different'),/tilhører ikke/);
    assert.equal(purchase().stripe_refund_id,'original');assert.equal(purchase().payment_status,'captured');assert.equal(rows.trainer_ledger[0].status,'eligible');
  }
  console.log('PASS failed refund ID replaced by successful retry ID; eligible/batched/paid ledger handled exactly once; pending/succeeded/unknown refund IDs cannot be replaced');

  reset();failCreate=true;console.error=()=>{};assert.equal((await action(form('refund'))).ok,false);console.error=originalError;
  assert.equal(purchase().payment_status,'captured');assert.equal(hasPaidCourseAccess(purchase()),true);assert.equal(rows.trainer_ledger[0].status,'eligible');
  reset();refundState='pending';await action(form('refund'));assert.equal(hasPaidCourseAccess(purchase()),true);assert.equal(purchase().payment_status,'captured');assert.equal(rows.notifications.length,0);
  refunds[0].status='failed';await refundModule.syncOnlineCourseRefund('refund');assert.equal(hasPaidCourseAccess(purchase()),true);assert.equal(rows.trainer_ledger[0].status,'eligible');
  reset();failFinalize=true;console.error=()=>{};await action(form('refund'));console.error=originalError;assert.equal(purchase().status,'active');failFinalize=false;
  await action(form('refund'));assert.equal(createCalls,1);assert.equal(purchase().status,'refunded');
  reset();console.error=()=>{};await Promise.all([action(form('refund')),action(form('refund'))]);console.error=originalError;assert.equal(createCalls,1);
  console.log('PASS failed/pending refunds retain access; crash recovery reuses Stripe refund; concurrent refund requests do not duplicate Stripe creation');

  reset();refunds.push({id:'refund',metadata:{online_course_purchase_id:'purchase'},payment_intent:'wrong',amount:92900,currency:'nok',status:'succeeded'});
  await assert.rejects(refundModule.syncOnlineCourseRefund('refund'),/stemmer ikke/);assert.equal(purchase().status,'active');
  refunds[0].payment_intent='pi';
  const {POST}=load('app/api/stripe/webhook/route.ts');
  const request=()=>new Request('https://test.invalid/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'mock'},body:JSON.stringify({type:'refund.updated',data:{object:refunds[0]}})});
  assert.equal((await POST(request())).status,200);assert.equal((await POST(request())).status,200);assert.equal(rows.notifications.length,1);assert.equal(emailCalls.length,1);
  assert.equal(rows.trainer_ledger[0].status,'reversed');
  console.log('PASS actual refund webhook path and retry deduplication; mismatched PaymentIntent rejected');

  reset();userId='customer';
  const {GET:media}=load('app/api/online-course-media/[purchaseId]/[lessonId]/route.ts');
  const mediaParams={params:Promise.resolve({purchaseId:'purchase',lessonId:'lesson'})};
  const mediaRequest=()=>new Request('https://test.invalid/api/online-course-media/purchase/lesson?kind=video',{headers:{range:'bytes=0-3'}});
  const originalFetch=global.fetch;let mediaFetches=0;
  global.fetch=async(url,options)=>{assert.equal(url,'https://private-storage.test/media');assert.equal(options.headers.get('range'),'bytes=0-3');mediaFetches++;return new Response('data',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-3/10'}});};
  try {
    let response=await media(mediaRequest(),mediaParams);assert.equal(response.status,206);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(await response.text(),'data');
    purchase().access_revoked_at='2026-10-16T12:00:00Z';
    response=await media(mediaRequest(),mediaParams);assert.equal(response.status,403);assert.equal(mediaFetches,1);
    const lesson=load('app/learn/[purchaseId]/lesson/[lessonId]/page.tsx').default;
    await assert.rejects(lesson({params:Promise.resolve({purchaseId:'purchase',lessonId:'lesson'}),searchParams:Promise.resolve({})}),/account#nettkurs/);
    const {GET:certificate}=load('app/certificates/[purchaseId]/route.ts');
    const cert=await certificate(new Request('https://test.invalid/certificates/purchase'),{params:Promise.resolve({purchaseId:'purchase'})});assert.equal(cert.status,404);
    purchase().access_revoked_at=null;response=await media(mediaRequest(),mediaParams);assert.equal(response.status,206);
    purchase().status=purchase().payment_status='refunded';response=await media(mediaRequest(),mediaParams);assert.equal(response.status,403);
  } finally {global.fetch=originalFetch;}
  console.log('PASS media range streaming and no-store; revoked/refunded media denied; revoked lesson/certificate denied; restored media available');

  const sql=fs.readFileSync('supabase/online-course-purchaser-controls-upgrade.sql','utf8');
  for(const required of ['BEGIN;','COMMIT;','c.trainer_id = auth.uid()','p.access_revoked_at is null',"v_purchase.payment_status = 'refunded'",'on conflict do nothing','guard_online_course_progress_access','for update'])assert.ok(sql.includes(required),required);
  assert.doesNotMatch(sql,/create policy.*(insert|update|delete)|grant update/i);
  assert.doesNotMatch(sql,/^as \$$|^\$;$/m);
  assert.match(sql,/p.status in \('active','refunded'\).*p.payment_status in \('captured','refunded'\)/);
  assert.match(sql,/v_purchase.stripe_refund_id <> p_refund_id\s+and v_purchase.refund_status is distinct from 'failed'/);
  assert.ok(sql.indexOf("v_purchase.refund_status is distinct from 'failed'") < sql.indexOf("if v_purchase.payment_status = 'refunded' then return"));
  console.log('PASS migration ownership/access guards, transaction and idempotent ledger assertions. All external services/SQL behavior mocked; no live refund performed.');
})().catch(error=>{console.error=originalError;console.error(error);process.exitCode=1;});
