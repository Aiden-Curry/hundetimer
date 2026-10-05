const fs=require('fs');let p='app/certificate/[certificateId]/page.tsx';let s=fs.readFileSync(p,'utf8');s="import '@/app/learn/learning.css';\n"+s;s=s.replace(".eq('certificate_id',certificateId).maybeSingle()",".eq('certificate_id',certificateId).eq('status','active').eq('payment_status','captured').maybeSingle()");s=s.replace('page-shell narrow','page-shell narrow certificate-page');fs.writeFileSync(p,s);
p='app/certificates/[purchaseId]/route.ts';s=fs.readFileSync(p,'utf8');s=s.replace(".eq('customer_id',user.id).maybeSingle()",".eq('customer_id',user.id).eq('status','active').eq('payment_status','captured').maybeSingle()");fs.writeFileSync(p,s);
p='app/learn/[purchaseId]/actions.ts';s=fs.readFileSync(p,'utf8');s=s.replace("import { revalidatePath }", "import { redirect } from 'next/navigation';\nimport { revalidatePath }");s=s.replace('if(error)throw new Error(error.message);',"if(error)redirect(`/learn/${encodeURIComponent(purchaseId)}/lesson/${encodeURIComponent(lessonId)}?error=progress`);");fs.writeFileSync(p,s);
const sql=fs.readFileSync('supabase/certificates-upgrade.sql','utf8');let fn=sql.slice(sql.indexOf('create or replace function public.set_online_course_lesson_complete_v2'),sql.indexOf('-- Keep direct table writes'));
fn=fn.replace("and p.payment_status = 'captured';","and p.payment_status = 'captured'\n  for update;");
fs.writeFileSync('supabase/course-progress-integrity-upgrade.sql',`-- Run after certificates-upgrade.sql.
-- Serialize progress changes per purchase so simultaneous final lessons issue one certificate.
-- All customer progress writes must use the completion-aware RPC.
drop policy if exists "online_course_progress_owner_insert" on public.online_course_progress;
drop policy if exists "online_course_progress_owner_delete" on public.online_course_progress;
revoke insert, update, delete on public.online_course_progress from anon, authenticated;

`+fn);
