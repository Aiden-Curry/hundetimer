'use server';
import { redirect } from 'next/navigation';

// Retained for old forms; the signed agreement flow is the only acceptance path.
export async function acceptTrainerAgreementAction(_formData: FormData) {
  redirect('/vilkar/treneravtale');
}
