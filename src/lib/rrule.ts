// Özel tekrar kuralları (RRULE alt kümesi): FREQ, INTERVAL, BYDAY (MO,WE · 2TU · -1FR), BYMONTHDAY (15 · -1).
// complete_task (DB) ile aynı mantık; takvimde gelecek örnekleri göstermek ve açıklama yazmak için.
import { addDays, daysInMonth, parseKey, weekdayOf, type DayKey } from './dates';

export const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const BYDAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ORD: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '-1': 'last' };

export interface Rule { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval: number; byday: { n: number | null; d: number }[]; bymonthday: number | null }
export function parseRule(r: string | null | undefined): Rule | null {
  if (!r) return null;
  const get = (k: string) => new RegExp(`${k}=([^;]+)`).exec(r)?.[1];
  const freq = get('FREQ') as Rule['freq'] | undefined;
  if (!freq) return null;
  const byday = (get('BYDAY') ?? '').split(',').filter(Boolean).map((x) => { const m = /^([+-]?\d)?([A-Z]{2})$/.exec(x); return m ? { n: m[1] ? Number(m[1]) : null, d: BYDAY.indexOf(m[2]) } : null; }).filter((x): x is { n: number | null; d: number } => !!x && x.d >= 0);
  const md = get('BYMONTHDAY');
  return { freq, interval: Math.max(1, Number(get('INTERVAL') ?? 1)), byday, bymonthday: md ? Number(md) : null };
}
export function buildRule(r: Rule): string {
  let s = `FREQ=${r.freq}`;
  if (r.interval > 1) s += `;INTERVAL=${r.interval}`;
  if (r.byday.length) s += `;BYDAY=${r.byday.map((b) => `${b.n ?? ''}${BYDAY[b.d]}`).join(',')}`;
  if (r.bymonthday) s += `;BYMONTHDAY=${r.bymonthday}`;
  return s;
}

const dayNum = (k: DayKey) => { const { y, m, d } = parseKey(k); return Date.UTC(y, m, d) / 86400000; };
function matches(r: Rule, start: DayKey, k: DayKey): boolean {
  const a = parseKey(start), b = parseKey(k);
  const wd = weekdayOf(k);
  if (r.freq === 'DAILY') return (dayNum(k) - dayNum(start)) % r.interval === 0;
  if (r.freq === 'WEEKLY') {
    const w = Math.floor((dayNum(addDays(k, -wd)) - dayNum(addDays(start, -weekdayOf(start)))) / 7);
    if (w % r.interval !== 0) return false;
    return r.byday.length ? r.byday.some((x) => x.d === wd) : wd === weekdayOf(start);
  }
  if (r.freq === 'MONTHLY') {
    const md = (b.y - a.y) * 12 + (b.m - a.m);
    if (md % r.interval !== 0) return false;
    const dim = daysInMonth(b.y, b.m);
    if (r.byday.length) return r.byday.some((x) => x.d === wd && (x.n == null || (x.n > 0 ? Math.ceil(b.d / 7) === x.n : Math.ceil((dim - b.d + 1) / 7) === -x.n)));
    if (r.bymonthday) return r.bymonthday > 0 ? b.d === Math.min(r.bymonthday, dim) : b.d === dim + 1 + r.bymonthday;
    return b.d === Math.min(a.d, dim);
  }
  return (b.y - a.y) % r.interval === 0 && b.m === a.m && b.d === Math.min(a.d, daysInMonth(b.y, b.m));
}
/** Verilen günden sonraki ilk örnek. */
export function nextOccurrence(rrule: string, from: DayKey): DayKey | null {
  const r = parseRule(rrule); if (!r) return null;
  let k = from;
  for (let i = 0; i < 2000; i++) { k = addDays(k, 1); if (matches(r, from, k)) return k; }
  return null;
}
export function occurrences(rrule: string, start: DayKey, from: DayKey, to: DayKey, max = 400): DayKey[] {
  const r = parseRule(rrule); if (!r) return [];
  const out: DayKey[] = [];
  let k = start;
  for (let i = 0; i < 4000 && out.length < max; i++) { k = addDays(k, 1); if (k > to) break; if (k >= from && matches(r, start, k)) out.push(k); }
  return out;
}
export function describeRule(rrule: string | null | undefined): string {
  const r = parseRule(rrule); if (!r) return 'No repeat';
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq];
  let s = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`;
  if (r.freq === 'WEEKLY' && r.byday.length) s += ` on ${r.byday.map((b) => BYDAY_LABEL[b.d]).join(', ')}`;
  if (r.freq === 'MONTHLY' && r.byday.length) s += ` on the ${r.byday.map((b) => `${b.n != null ? ORD[String(b.n)] + ' ' : ''}${FULL[b.d]}`).join(', ')}`;
  if (r.freq === 'MONTHLY' && r.bymonthday) s += r.bymonthday === -1 ? ' on the last day' : ` on day ${r.bymonthday}`;
  return s;
}
