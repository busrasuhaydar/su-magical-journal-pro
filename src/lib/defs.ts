// Tanımlar (durum/kategori/öncelik/aşama adları ve renkleri), takvim ve görünüm tercihleri. profiles.ui_prefs'te; yüklenince sabit tablolara uygulanır.
import { OPEN_STATUSES, OPP_STATUS_COLOR, OPP_STATUS_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, PROJECT_STATUS_LABEL, STATUS_LABEL, TASK_CATEGORIES } from './types';
import { setPref } from './prefs';
import { setWeekStart } from './dates';

export type DefKind = 'task_status' | 'priority' | 'project_status' | 'opp_status';
export interface DefEntry { label?: string; color?: string }
export interface Defs { task_status?: Record<string, DefEntry>; priority?: Record<string, DefEntry>; project_status?: Record<string, DefEntry>; opp_status?: Record<string, DefEntry>; categories?: string[]; category_colors?: Record<string, string> }
export interface CalPrefs { view?: 'year' | 'month' | 'week' | 'agenda'; weekStart?: 1 | 0 | 6; types?: string[]; colors?: Record<string, string> }
export interface LookPrefs { accent?: string; bgArtwork?: string | null; effects?: 'high' | 'medium' | 'simple'; font?: 'default' | 'serif' | 'rounded' | 'system' | 'mono'; scale?: number }

const BASE = {
  task_status: { ...STATUS_LABEL } as Record<string, string>,
  priority: { ...PRIORITY_LABEL } as Record<string, string>,
  project_status: { ...PROJECT_STATUS_LABEL } as Record<string, string>,
  opp_status: { ...OPP_STATUS_LABEL } as Record<string, string>,
  opp_color: { ...OPP_STATUS_COLOR } as Record<string, string>,
  categories: [...TASK_CATEGORIES],
};
export const DEF_TITLES: Record<DefKind, string> = { task_status: 'Task statuses', priority: 'Priority names', project_status: 'Project statuses', opp_status: 'Opportunity stages' };
export const baseLabels = (k: DefKind) => BASE[k];
export const baseCategories = () => BASE.categories;
export const DEF_COLORS: Record<string, Record<string, string>> = { task_status: {}, priority: { urgent: '#D2455A', high: '#F28A5C', medium: '#FFC94D', low: '#8FDCE8' }, project_status: {}, opp_status: BASE.opp_color };
/** Kullanıcının eklediği/renklendirdiği değerler dahil renk. */
export const defColor = (k: DefKind, v: string, d?: Defs) => d?.[k]?.[v]?.color || DEF_COLORS[k]?.[v] || '#C4A8B8';

let applied = '';
/** Sabit etiket tablolarını yerinde günceller (tüm ekranlar aynı adları görür). */
export function applyDefs(d: Defs | undefined) {
  const key = JSON.stringify(d ?? {});
  if (key === applied) return;
  applied = key;
  const put = (target: Record<string, string>, base: Record<string, string>, over?: Record<string, DefEntry>) => {
    Object.keys(target).forEach((k) => { if (!(k in base)) delete target[k]; });
    Object.assign(target, base);
    Object.entries(over ?? {}).forEach(([k, v]) => { if (v.label?.trim()) target[k] = v.label.trim(); else if (!(k in base)) target[k] = k; });
  };
  put(STATUS_LABEL as Record<string, string>, BASE.task_status, d?.task_status);
  put(PRIORITY_LABEL as Record<string, string>, BASE.priority, d?.priority);
  put(PROJECT_STATUS_LABEL as Record<string, string>, BASE.project_status, d?.project_status);
  put(OPP_STATUS_LABEL as Record<string, string>, BASE.opp_status, d?.opp_status);
  const oc = OPP_STATUS_COLOR as Record<string, string>;
  Object.assign(oc, BASE.opp_color);
  Object.entries(d?.opp_status ?? {}).forEach(([k, v]) => { if (v.color) oc[k] = v.color; });
  Object.keys(d?.priority ?? {}).forEach((k) => { if (!(k in PRIORITY_ORDER)) (PRIORITY_ORDER as Record<string, number>)[k] = 2.5; });
  Object.keys(d?.task_status ?? {}).forEach((k) => { if (!(k in BASE.task_status) && !OPEN_STATUSES.includes(k as never)) OPEN_STATUSES.push(k as never); });
  TASK_CATEGORIES.splice(0, TASK_CATEGORIES.length, ...(d?.categories?.length ? d.categories : BASE.categories));
}

const FONTS: Record<string, string> = {
  serif: '"Cormorant Garamond", "Playfair Display", Georgia, serif',
  rounded: '"Nunito", "Quicksand", ui-rounded, system-ui, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
/** Tema rengi, efekt yoğunluğu, yazı tipi ve boyutu → :root. */
export function applyLook(l: LookPrefs | undefined) {
  const r = document.documentElement;
  if (l?.accent) r.style.setProperty('--accent-user', l.accent); else r.style.removeProperty('--accent-user');
  r.classList.toggle('accent-user', !!l?.accent);
  const fx = l?.effects ?? null;
  if (fx) { r.dataset.fx = fx; r.classList.toggle('simple', fx === 'simple'); setPref('simple', fx === 'simple' ? '1' : '0'); }
  if (l?.font && FONTS[l.font]) r.style.setProperty('--font-user', FONTS[l.font]); else r.style.removeProperty('--font-user');
  r.classList.toggle('font-user', !!(l?.font && FONTS[l.font]));
  r.style.fontSize = l?.scale && l.scale !== 100 ? `${l.scale}%` : '';
}

export const CAL_TYPES: [string, string, string][] = [['task', 'Tasks', '#E2558C'], ['event', 'Events', '#1FA9A6'], ['post', 'Social posts', '#8FDCE8'], ['opp', 'Opportunity dates', '#9B6FE0'], ['hol', 'Holidays', '#B23A6B'], ['extra', 'Follow-ups & milestones', '#F28A5C'], ['ext', 'External calendars', '#5AA9E6']];
/** Takvimde gösterilen kayıt türleri (null = hepsi). */
export const CAL: { types: string[] | null; view: string } = { types: null, view: 'month' };
export function applyCalendar(c: CalPrefs | undefined) {
  setWeekStart(c?.weekStart ?? 1);
  CAL.types = c?.types?.length ? c.types : null;
  CAL.view = c?.view ?? 'month';
  const r = document.documentElement;
  CAL_TYPES.forEach(([k]) => { const v = c?.colors?.[k]; if (v) r.style.setProperty(`--cal-${k}`, v); else r.style.removeProperty(`--cal-${k}`); });
}
export const calShows = (k: string) => !CAL.types || CAL.types.includes(k);
