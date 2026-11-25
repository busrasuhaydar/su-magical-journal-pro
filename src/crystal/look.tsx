// Kişiselleştirme: profil fotoğrafı ve arkaplan görseli. Files 'files' kovasında <uid>/ui/ altında, yolları profiles.ui_prefs'te.
// Arkaplan yüklenirken otomatik boyutlanır (en çok 2560 px, webp); ekranda her cihazda "cover" + akıllı odakla çizilir.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { signedUrl, useProfile, useUpdateProfile } from '../lib/data';
import { supabase } from '../lib/supabase';
import { setPref } from '../lib/prefs';
import { setBackground } from './scene';

async function toWebp(file: File, max: number, square: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  let sw = bmp.width, sh = bmp.height, sx = 0, sy = 0;
  if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image could not be processed'))), 'image/webp', square ? 0.9 : 0.86));
}

export function useLookUpload() {
  const profile = useProfile();
  const update = useUpdateProfile();
  return async (kind: 'avatar' | 'bg', file: File | null) => {
    const ui = profile.data?.ui_prefs ?? {};
    if (!file) { await update.mutateAsync({ ui_prefs: { ...ui, [kind]: null } }); if (kind === 'bg') setPref('bgCustom', '0'); return; }
    const blob = await toWebp(file, kind === 'avatar' ? 320 : 2560, kind === 'avatar');
    const { data: u } = await supabase.auth.getUser();
    const path = `${u.user!.id}/ui/${kind}-${Date.now()}.webp`;
    const up = await supabase.storage.from('files').upload(path, blob, { contentType: 'image/webp', upsert: true });
    if (up.error) throw up.error;
    await update.mutateAsync({ ui_prefs: { ...ui, [kind]: path } });
    if (kind === 'bg') setPref('bgCustom', '1');
  };
}

export function useLookUrl(kind: 'avatar' | 'bg') {
  const path = useProfile().data?.ui_prefs?.[kind] ?? null;
  return useQuery({ queryKey: ['look', path], enabled: !!path, staleTime: 45 * 60_000, queryFn: () => (/^https?:/.test(path!) ? Promise.resolve(path!) : signedUrl(path!)) }).data ?? null;
}

/** Shell'de bir kez: özel arkaplanı sahneye ve CSS yedeğine uygular. */
export function useApplyBackground() {
  const profile = useProfile();
  const path = profile.data?.ui_prefs?.bg ?? null;
  const url = useLookUrl('bg');
  useEffect(() => {
    if (!profile.data) return;
    if (!path) { setPref('bgCustom', '0'); setBackground(null); return; }
    if (url) setBackground(url);
  }, [profile.data, path, url]);
}

/** Home düğmesinin simgesi: profil fotoğrafı varsa o, yoksa verilen simge. */
export function HomeIcon({ fallback, size }: { fallback: React.ReactNode; size: number }) {
  const url = useLookUrl('avatar');
  return url ? <img className="cr-ava" src={url} alt="" width={size} height={size} /> : <>{fallback}</>;
}
