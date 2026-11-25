import { createClient } from '@supabase/supabase-js';
import { configureOffline, offlineFetch } from './offline';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !anon) throw new Error('Supabase settings are missing: .env must contain VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');

export const supabase = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: offlineFetch } });

/** Supabase hatasını kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function errText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/Email not confirmed/i.test(msg)) return 'Your email address isn’t verified yet. Click the link in your inbox.';
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/Password should be at least/i.test(msg)) return 'Password must be at least 6 characters.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Try again in a few minutes.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Couldn’t reach the server. Check your internet connection.';
  if (/duplicate key/i.test(msg)) return 'This record already exists.';
  if (/check constraint/i.test(msg)) return 'One of the values is invalid (e.g. end time can’t be before the start).';
  return `An error occurred: ${msg}`;
}

export async function sha256(file: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function slugify(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', é: 'e', â: 'a', î: 'i', û: 'u' };
  return s.toLocaleLowerCase('en').replace(/[çğıöşüéâîû]/g, (c) => map[c] ?? c).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

// Sayfa kapanırken kaydetme: tarayıcı isteği kesmesin diye keepalive fetch ile doğrudan REST'e yazar.
let accessToken: string | null = null;
supabase.auth.getSession().then(({ data }) => { accessToken = data.session?.access_token ?? null; });
supabase.auth.onAuthStateChange((_e, s) => { accessToken = s?.access_token ?? null; });
export function keepaliveUpsert(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length || !accessToken) return;
  try {
    void fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST', keepalive: true,
      headers: { apikey: anon, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
  } catch { /* yok say */ }
}
configureOffline({ url, anon, token: () => accessToken });
