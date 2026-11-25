// Tarih yardımcıları. Gün anahtarları 'YYYY-MM-DD'; tüm saatler Europe/Istanbul'da gösterilir.
export const TZ = 'Europe/Istanbul';
export type DayKey = string;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_MIN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
export const key = (y: number, m: number, d: number): DayKey => `${y}-${pad(m + 1)}-${pad(d)}`; // m: 0-11

export function parseKey(k: DayKey) {
  const [y, m, d] = k.split('-').map(Number);
  return { y, m: m - 1, d };
}

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Pazartesi = 0 … Pazar = 6 */
export function weekdayOf(k: DayKey) {
  const { y, m, d } = parseKey(k);
  return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
}

export function addDays(k: DayKey, n: number): DayKey {
  const { y, m, d } = parseKey(k);
  const t = new Date(Date.UTC(y, m, d + n));
  return key(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

export function addMonths(k: DayKey, n: number): DayKey {
  const { y, m, d } = parseKey(k);
  const t = new Date(Date.UTC(y, m + n, 1));
  return key(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, daysInMonth(t.getUTCFullYear(), t.getUTCMonth())));
}

let weekShift = 0; // 0 = Pazartesi, 6 = Pazar, 5 = Cumartesi (takvim tercihi)
/** Haftanın ilk günü (JS gün numarası: 1 Pzt, 0 Paz, 6 Cmt). */
export function setWeekStart(js: number) { weekShift = (js + 6) % 7; }
/** Haftalık sütun (0 = haftanın ilk günü). */
export const colOf = (k: DayKey) => (weekdayOf(k) - weekShift + 7) % 7;
/** Haftanın ilk gününe göre döndürülmüş gün başlıkları. */
export const weekHead = (arr: string[] = WEEKDAYS_SHORT) => [...arr.slice(weekShift), ...arr.slice(0, weekShift)];
export const startOfWeek = (k: DayKey) => addDays(k, -colOf(k));
export const startOfMonth = (k: DayKey) => { const { y, m } = parseKey(k); return key(y, m, 1); };
export const endOfMonth = (k: DayKey) => { const { y, m } = parseKey(k); return key(y, m, daysInMonth(y, m)); };

/** Ay ızgarası: Pazartesi başlangıçlı, boş hücreler null. */
export function monthMatrix(y: number, m: number): (DayKey | null)[] {
  const first = key(y, m, 1);
  const cells: (DayKey | null)[] = Array(colOf(first)).fill(null);
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(key(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function tzParts(date: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFmt.formatToParts(date)) if (type !== 'literal') p[type] = Number(value);
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
function offsetMs(date: Date) {
  const p = tzParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** İstanbul'daki gün + dakikayı ISO zaman damgasına çevirir. */
export function toInstant(k: DayKey, minutes: number): string {
  const { y, m, d } = parseKey(k);
  const naive = Date.UTC(y, m, d, Math.floor(minutes / 60), minutes % 60);
  let t = naive - offsetMs(new Date(naive));
  t = naive - offsetMs(new Date(t)); // yaz saati geçişleri için ikinci tur
  return new Date(t).toISOString();
}

export function dayKeyOf(iso: string | Date): DayKey {
  const p = tzParts(typeof iso === 'string' ? new Date(iso) : iso);
  return key(p.year, p.month - 1, p.day);
}
export function minutesOf(iso: string | Date) {
  const p = tzParts(typeof iso === 'string' ? new Date(iso) : iso);
  return p.hour * 60 + p.minute;
}
export const todayKey = () => dayKeyOf(new Date());

export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

export function formatLong(k: DayKey) {
  const { y, m, d } = parseKey(k);
  return `${WEEKDAYS[weekdayOf(k)]}, ${MONTHS[m]} ${d}, ${y}`;
}
export function formatShort(k: DayKey) {
  const { m, d } = parseKey(k);
  return `${MONTHS[m].slice(0, 3)} ${d}`;
}
export function formatRelative(k: DayKey, today = todayKey()) {
  if (k === today) return 'Today';
  if (k === addDays(today, 1)) return 'Tomorrow';
  if (k === addDays(today, -1)) return 'Yesterday';
  return formatShort(k);
}
export function daysBetween(a: DayKey, b: DayKey) {
  const A = parseKey(a), B = parseKey(b);
  return Math.round((Date.UTC(B.y, B.m, B.d) - Date.UTC(A.y, A.m, A.d)) / 86400000);
}
export const isValidKey = (k?: string): k is DayKey => !!k && /^\d{4}-\d{2}-\d{2}$/.test(k) && parseKey(k).d <= daysInMonth(parseKey(k).y, parseKey(k).m);
