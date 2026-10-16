const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, overrides } = require('../.review/customer-fixtures.cjs');

let userId = 'trainer', progressOffline = false;
const stamp = '2026-10-15T12:00:00Z';
const courses = [{ id:'course', trainer_id:'trainer', title:'Valpekurs' }, { id:'other', trainer_id:'other-trainer', title:'Annet kurs' }];
const modules = [{ id:'module', course_id:'course', title:'Grunnlag', position:0 }];
const lessons = [1,2,3,4].map(n=>({id:'lesson'+n,course_id:'course',module_id:'module',position:n,title:'Leksjon '+n}));
const purchases = [
  {id:'purchase',course_id:'course',customer_id:'customer',dog_name:'Luna',purchased_at:stamp,status:'active',payment_status:'captured'},
  {id:'finished',course_id:'course',customer_id:'graduate',dog_name:null,purchased_at:stamp,status:'active',payment_status:'captured',course_completed_at:stamp},
  {id:'pending',course_id:'course',customer_id:'unpaid',status:'checkout_pending',payment_status:'checkout_pending'},
  {id:'foreign',course_id:'other',customer_id:'unrelated',status:'active',payment_status:'captured'},
];
const progress = [
  {purchase_id:'purchase',lesson_id:'lesson1',completed_at:stamp},
  {purchase_id:'purchase',lesson_id:'lesson2',completed_at:stamp},
  {purchase_id:'purchase',lesson_id:'removed-lesson',completed_at:stamp},
  ...lessons.map(l=>({purchase_id:'finished',lesson_id:l.id,completed_at:stamp})),
  {purchase_id:'foreign',lesson_id:'foreign-lesson',completed_at:stamp},
];
const owns = courseId => courses.some(c=>c.id===courseId && c.trainer_id===userId);
const canReadPurchase = p => p.customer_id===userId || owns(p.course_id) || userId==='admin';
const tables = {online_courses:courses,online_course_modules:modules,online_course_lessons:lessons,online_course_purchases:purchases,online_course_progress:progress};
const queried = [];
const db = {
  auth:{getUser:async()=>({data:{user:{id:userId}}})},
  from(table) {
    let filters=[],single=false,operation='select',columns;
    const q=new Proxy({}, {get(_,method){
      if(method==='then') return resolve=>{
        if(table==='online_course_progress' && operation!=='select') return resolve({data:null,error:Error('permission denied')});
        let data=[...(tables[table]||[])];
        if(table==='online_course_purchases') data=data.filter(canReadPurchase);
        if(table==='online_course_progress') data=data.filter(row=>purchases.some(p=>p.id===row.purchase_id && (owns(p.course_id) || p.customer_id===userId && p.status==='active')));
        data=data.filter(row=>filters.every(fn=>fn(row)));
        if(columns && columns!=='*') data=data.map(row=>Object.fromEntries(columns.split(',').map(key=>[key,row[key]])));
        resolve({data:single?data[0]||null:data,error:progressOffline&&table==='online_course_progress'?Error('offline'):null});
      };
      return (...args)=>{
        if(method==='select'){columns=args[0];queried.push({table,columns});}
        if(['insert','update','delete'].includes(method))operation=method;
        if(method==='eq')filters.push(row=>row[args[0]]===args[1]);
        if(method==='in')filters.push(row=>args[1].includes(row[args[0]]));
        if(['single','maybeSingle'].includes(method))single=true;
        return q;
      };
    }});return q;
  },
  rpc: async(name,args)=>{
    if(name==='trainer_online_course_customer_names') return {data:owns(args.p_course_id)?purchases.filter(p=>p.course_id===args.p_course_id&&p.status==='active'&&p.payment_status==='captured').map(p=>({customer_id:p.customer_id,display_name:p.customer_id==='customer'?'Kari':'Ola'})):[],error:null};
    if(name==='set_online_course_lesson_complete_v2') {
      const p=purchases.find(p=>p.id===args.p_purchase_id&&p.customer_id===userId&&p.status==='active'&&p.payment_status==='captured');
      if(!p)return {error:Error('Du har ikke tilgang til dette kurset.')};
      const l=lessons.find(l=>l.id===args.p_lesson_id&&l.course_id===p.course_id);
      if(!l)return {error:Error('Leksjonen finnes ikke.')};
      progress.push({purchase_id:p.id,lesson_id:l.id,completed_at:stamp});return {data:{newly_completed:false},error:null};
    }
    throw Error('Unexpected RPC '+name);
  },
};
overrides['@/lib/supabase/server']={createClient:async()=>db};
overrides['@/lib/trainer-journey-server']={getTrainerJourney:async()=>({stage:'ready'})};
overrides['@/components/online-course-editor']={OnlineCourseEditor:()=>React.createElement('div',null,'Editor')};
const {TrainerCourseStudents}=load('components/trainer-course-students.tsx');
async function render(course=courses[0]) {return renderToStaticMarkup(await TrainerCourseStudents({course,modules,lessons}));}
const page=load('app/trainer-dashboard/online-courses/[id]/page.tsx').default;
(async()=>{
  const html=await render();
  for(const value of ['Kari','Ola','Luna','2 av 4 leksjoner','50%','4 av 4 leksjoner','100%','Fullført','Grunnlag','Leksjon 4','Sist aktivitet','Betalt'])assert.ok(html.includes(value),value);
  assert.match(html,/Fullført:.*2026/);
  assert.doesNotMatch(html,/unrelated|unpaid|stripe_|name="complete"|name="lessonId"/);
  assert.ok(!queried.some(q=>q.table==='profiles'));
  const purchaseColumns=queried.find(q=>q.table==='online_course_purchases').columns;
  assert.doesNotMatch(purchaseColumns,/\*|stripe|secret/);
  await page({params:Promise.resolve({id:'course'})});
  await assert.rejects(page({params:Promise.resolve({id:'other'})}),/notFound/);
  userId='other-trainer';assert.match(await render(),/Ingen har kjøpt dette kurset ennå/);
  assert.deepEqual((await db.from('online_course_progress').select('*').eq('purchase_id','purchase')).data,[]);
  userId='trainer';
  for(const operation of ['insert','update','delete'])assert.ok((await db.from('online_course_progress')[operation]({})).error);
  const action=load('app/learn/[purchaseId]/actions.ts').setLessonCompleteAction;
  const form=new FormData();form.set('purchaseId','purchase');form.set('lessonId','lesson3');
  await assert.rejects(action(form),/error=progress/);
  userId='customer';await action(form);
  assert.ok((await db.from('online_course_progress').select('*').eq('purchase_id','purchase')).data.some(p=>p.lesson_id==='lesson3'));
  userId='trainer';assert.match(await render(),/3 av 4 leksjoner/);assert.match(await render(),/75%/);
  progressOffline=true;assert.match(await render(),/Kunne ikke hente fremdrift/);progressOffline=false;
  userId='admin';assert.equal((await db.from('online_course_purchases').select('*')).data.length,purchases.length);
  // Admin progress access stays as before: this migration adds no admin policy.
  assert.deepEqual((await db.from('online_course_progress').select('*')).data,[]);
  const sql=fs.readFileSync('supabase/trainer-online-course-progress-upgrade.sql','utf8');
  assert.match(sql,/for select\s+to authenticated/);assert.match(sql,/p.id = online_course_progress.purchase_id/);assert.match(sql,/c.trainer_id = auth.uid\(\)/);
  assert.doesNotMatch(sql,/for (insert|update|delete|all)|grant (insert|update|delete)|drop policy.*owner|on public.profiles/);
  assert.match(sql,/returns table \(customer_id uuid, display_name text\)/);
  const existing=fs.readFileSync('supabase/course-progress-integrity-upgrade.sql','utf8');
  assert.match(existing,/revoke insert, update, delete on public.online_course_progress/);
  assert.match(existing,/p.customer_id = v_user_id/);
  console.log('PASS own-course students/count/percentage/completion and lesson details; other-course isolation; read-only trainer UI and progress writes denied; customer completion retained; admin behavior unchanged; narrow migration assertions. Auth/database/RLS mocked, not live Supabase.');
})().catch(error=>{console.error(error);process.exitCode=1;});
