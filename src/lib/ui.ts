// Home özelleştirmesi (profiles.ui_prefs): kart başlıkları, göster/gizle, Boston saati. Cihazlar arasında eşitlenir.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile, useUpdateProfile } from './data';
import type { Profile } from './types';

/** Favori / son açılan öğe (sayfa, proje, eser, etiket…). */
export interface NavRef { kind: 'page' | 'project' | 'artwork' | 'tag' | 'opportunity' | 'contact'; id: string; label: string; icon?: string | null; href: string }
export interface UiPrefs { titles?: Record<string, string>; hide?: string[]; boston?: boolean; avatar?: string | null; bg?: string | null; favorites?: NavRef[]; recent_items?: NavRef[] }
export const HOME_SECTIONS: [string, string][] = [
  ['plan', 'Today’s Plan'], ['routines', 'Reminders'], ['todo', 'To-dos'], ['art', 'Artwork of the Day'], ['ideas', 'On My Mind'],
  ['week', 'This Week'], ['upcoming', 'Upcoming'], ['social', 'Social Media'], ['projects', 'My Projects'],
];
export function useHomePrefs() {
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  return {
    ui,
    title: (k: string, d: string) => ui.titles?.[k]?.trim() || d,
    visible: (k: string) => !(ui.hide ?? []).includes(k),
    boston: ui.boston !== false,
  };
}
export const bostonTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
export const bostonDay = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d);

// ── Favoriler ve son açılanlar (profiles.ui_prefs: cihazlar arasında eşitlenir) ──
function usePrefsWriter() {
  const qc = useQueryClient();
  const update = useUpdateProfile();
  return (f: (ui: UiPrefs) => UiPrefs) => {
    const cur = qc.getQueryData<Profile>(['profile']);
    if (!cur) return;
    const next = f(cur.ui_prefs ?? {});
    qc.setQueryData<Profile>(['profile'], { ...cur, ui_prefs: next });
    update.mutate({ ui_prefs: next });
  };
}
export function useFavorites() {
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  const write = usePrefsWriter();
  const list = ui.favorites ?? [];
  return {
    list,
    isFav: (id: string) => list.some((f) => f.id === id),
    toggle: (r: NavRef) => write((u) => ({ ...u, favorites: (u.favorites ?? []).some((f) => f.id === r.id) ? (u.favorites ?? []).filter((f) => f.id !== r.id) : [...(u.favorites ?? []), r].slice(-24) })),
  };
}
export function useRecentItems() { return (useProfile().data?.ui_prefs?.recent_items ?? []) as NavRef[]; }
/** Açılan öğeyi "son açılanlar"ın başına yazar (zaten başta ise yazmaz). */
export function useTrackRecent(r: NavRef | null) {
  const profile = useProfile();
  const write = usePrefsWriter();
  const key = r ? `${r.id}|${r.label}|${r.icon ?? ''}` : '';
  useEffect(() => {
    if (!r || !profile.data) return;
    const cur = profile.data.ui_prefs?.recent_items ?? [];
    if (cur[0]?.id === r.id && cur[0]?.label === r.label && cur[0]?.icon === r.icon) return;
    write((u) => ({ ...u, recent_items: [r, ...(u.recent_items ?? []).filter((x) => x.id !== r.id)].slice(0, 10) }));
  }, [key, !!profile.data]); // eslint-disable-line react-hooks/exhaustive-deps
}
