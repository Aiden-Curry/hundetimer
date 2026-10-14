import { Dog } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DOG_PHOTO_BUCKET } from '@/lib/dogs';

export async function DogAvatar({ path, name }: { path?: string | null; name: string }) {
  const supabase = path ? await createClient() : null;
  const result = path && supabase ? await supabase.storage.from(DOG_PHOTO_BUCKET).createSignedUrl(path, 3600) : null;
  return <div className="dog-avatar-placeholder" style={{ overflow: 'hidden', flexShrink: 0 }}>
    {result?.data?.signedUrl ? <img src={result.data.signedUrl} alt={name} width={64} height={64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Dog size={26} aria-label={name} />}
  </div>;
}
