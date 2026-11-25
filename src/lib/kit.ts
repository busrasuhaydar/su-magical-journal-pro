// Başvuru kiti: biyografi / CV / sanatçı beyanı × TR/EN × kısa/uzun.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type KitKind = 'bio' | 'cv' | 'statement';
export type KitLang = 'tr' | 'en';
export type KitLen = 'short' | 'long';
export interface KitItem { id: string; kind: KitKind; lang: KitLang; length: KitLen; title: string | null; body: string; updated_at: string }
export const KIT_KIND_LABEL: Record<KitKind, string> = { bio: 'Biography', cv: 'CV', statement: 'Artist statement' };
export const KIT_LANG_LABEL: Record<KitLang, string> = { tr: 'Turkish', en: 'English' };
export const KIT_LEN_LABEL: Record<KitLen, string> = { short: 'Short', long: 'Long' };
export const kitName = (k: Pick<KitItem, 'kind' | 'lang' | 'length'>) => `${KIT_KIND_LABEL[k.kind]} · ${k.lang.toUpperCase()} · ${KIT_LEN_LABEL[k.length]}`;

export function useKit() {
  return useQuery({ queryKey: ['kit'], queryFn: async () => {
    const { data, error } = await supabase.from('application_kit').select('*').is('deleted_at', null);
    if (error) throw error; return data as KitItem[];
  } });
}
export async function copyText(t: string) { await navigator.clipboard.writeText(t); }
