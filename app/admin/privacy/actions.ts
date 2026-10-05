'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin, writeAudit } from '@/lib/admin/moderation';
import { DELETION_GRACE_DAYS, processAccountDeletion } from '@/lib/privacy/server';

function value(v: FormDataEntryValue | null){ return String(v||'').trim(); }
function back(message:string,error=false){ redirect(`/admin/privacy?${error?'error':'message'}=${encodeURIComponent(message)}`); }

export async function approveDeletionAction(formData: FormData){
  const requestId=value(formData.get('requestId'));
  try{
    const {user,admin}=await requireAdmin();
    const {data:req,error}=await admin.from('account_deletion_requests').select('id,user_id,status').eq('id',requestId).single(); if(error)throw error;
    if(req.status!=='requires_review') throw new Error('Forespørselen venter ikke på gjennomgang.');
    const scheduled=new Date(Date.now()+DELETION_GRACE_DAYS*86400000).toISOString();
    const {error:updateError}=await admin.from('account_deletion_requests').update({status:'pending',scheduled_for:scheduled,reviewed_at:new Date().toISOString(),reviewed_by:user.id,admin_note:value(formData.get('note'))||null}).eq('id',requestId); if(updateError)throw updateError;
    await writeAudit(admin,{adminId:user.id,actionType:'account_deletion_approved',targetType:'user',targetId:req.user_id,note:value(formData.get('note')),metadata:{scheduled_for:scheduled}});
  }catch(e){back(e instanceof Error?e.message:'Kunne ikke godkjenne.',true)}
  revalidatePath('/admin/privacy'); back('Sletting er godkjent og planlagt.');
}
export async function rejectDeletionAction(formData: FormData){
  const requestId=value(formData.get('requestId')); const note=value(formData.get('note'))||'Forespørselen krever avklaring før kontoen kan slettes.';
  try{
    const {user,admin}=await requireAdmin(); const {data:req,error}=await admin.from('account_deletion_requests').select('id,user_id').eq('id',requestId).single(); if(error)throw error;
    const {error:updateError}=await admin.from('account_deletion_requests').update({status:'rejected',scheduled_for:null,reviewed_at:new Date().toISOString(),reviewed_by:user.id,admin_note:note}).eq('id',requestId); if(updateError)throw updateError;
    await writeAudit(admin,{adminId:user.id,actionType:'account_deletion_rejected',targetType:'user',targetId:req.user_id,note});
  }catch(e){back(e instanceof Error?e.message:'Kunne ikke avvise.',true)}
  revalidatePath('/admin/privacy'); back('Sletteforespørselen er avvist.');
}
export async function processDeletionNowAction(formData: FormData){
  const userId=value(formData.get('userId'));
  try{ const {user,admin}=await requireAdmin(); if(userId===user.id)throw new Error('Du kan ikke slette din egen adminkonto her.'); await processAccountDeletion(userId); await writeAudit(admin,{adminId:user.id,actionType:'account_deletion_processed',targetType:'user',targetId:userId,note:'Manuelt fullført av administrator.'}); }
  catch(e){back(e instanceof Error?e.message:'Kunne ikke fullføre sletting.',true)}
  revalidatePath('/admin/privacy'); back('Kontoslettingen er fullført.');
}
