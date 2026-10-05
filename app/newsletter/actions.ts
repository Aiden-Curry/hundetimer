 'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';

export async function subscribeTrainerNewsletterAction(fd:FormData){
 const trainerId=String(fd.get('trainerId')||''); const returnPath=String(fd.get('returnPath')||'/'); const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect(`/login?next=${encodeURIComponent(returnPath)}`);
 const admin=createAdminClient(); const [{data:profile},{data:trainer},auth]=await Promise.all([admin.from('profiles').select('display_name,role').eq('id',user.id).maybeSingle(),admin.from('trainer_profiles').select('id,verified').eq('id',trainerId).maybeSingle(),admin.auth.admin.getUserById(user.id)]);
 if(!profile||profile.role==='admin'||!trainer?.verified||!auth.data.user?.email)redirect(returnPath);
 const profileName=profile?.display_name ?? null;
 const {data:existing}=await admin.from('newsletter_subscriptions').select('id').eq('scope','trainer').eq('trainer_id',trainerId).eq('user_id',user.id).maybeSingle();
 const row={scope:'trainer',trainer_id:trainerId,user_id:user.id,email:auth.data.user.email,name:profileName,source:'marketplace',subscribed_at:new Date().toISOString(),unsubscribed_at:null,updated_at:new Date().toISOString()};
 if(existing)await admin.from('newsletter_subscriptions').update(row).eq('id',existing.id); else await admin.from('newsletter_subscriptions').insert(row);
 revalidatePath(returnPath);redirect(`${returnPath}?newsletter=subscribed`);
}
export async function unsubscribeTrainerNewsletterAction(fd:FormData){const trainerId=String(fd.get('trainerId')||'');const returnPath=String(fd.get('returnPath')||'/');const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect(`/login?next=${encodeURIComponent(returnPath)}`);const admin=createAdminClient();await admin.from('newsletter_subscriptions').update({unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('scope','trainer').eq('trainer_id',trainerId).eq('user_id',user.id);revalidatePath(returnPath);redirect(`${returnPath}?newsletter=unsubscribed`);}
