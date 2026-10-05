import { redirect } from 'next/navigation';

export default function BrowsePage() {
  redirect('/discover?type=trainers');
}
