import { redirect } from 'next/navigation';

export default function ActivitiesPage() {
  redirect('/discover?type=activities');
}
