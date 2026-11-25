// Kurallı tarih ayrıştırma (yapay zekâsız), Türkçe + İngilizce: "yarın 10:00", "cuma", "haftaya salı", "12 aralık", "3 gün sonra",
// "akşam 7", "tomorrow 3pm", "next friday", "dec 12 2027", "12.12", "2026-12-12".
import { addDays, formatShort, key, parseKey, todayKey, weekdayOf, WEEKDAYS_SHORT, type DayKey } from './dates';

const MONTHS: Record<string, number> = {
  ocak: 0, oca: 0, şubat: 1, şub: 1, subat: 1, mart: 2, mar: 2, nisan: 3, nis: 3, mayıs: 4, mayis: 4, may: 4, haziran: 5, haz: 5, temmuz: 6, tem: 6,
  ağustos: 7, agustos: 7, ağu: 7, eylül: 8, eylul: 8, eyl: 8, ekim: 9, eki: 9, kasım: 10, kasim: 10, kas: 10, aralık: 11, aralik: 11, ara: 11,
  january: 0, jan: 0, february: 1, feb: 1, march: 2, april: 3, apr: 3, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};
const WD: Record<string, number> = {
  pazartesi: 0, pzt: 0, salı: 1, sali: 1, çarşamba: 2, carsamba: 2, çar: 2, perşembe: 3, persembe: 3, per: 3, cuma: 4, cum: 4, cumartesi: 5, cmt: 5, pazar: 6, paz: 6,
  monday: 0, mon: 0, tuesday: 1, tue: 1, tues: 1, wednesday: 2, wed: 2, thursday: 3, thu: 3, thur: 3, thurs: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6,
};
export interface ParsedDate { day: DayKey; time: string | null; label: string }

export function parseDateText(input: string, today: DayKey = todayKey()): ParsedDate | null {
  const toks = input.toLocaleLowerCase('tr').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!toks.length) return null;
  let day: DayKey | null = null, h: number | null = null, mi = 0, pm: 'am' | 'pm' | null = null, nextWeek = false, bareHourOk = false;
  let i = 0;
  const peek = (o = 0) => toks[i + o];
  while (i < toks.length) {
    const t = peek();
    if (['bugün', 'bugun', 'today'].includes(t)) { day = today; i++; bareHourOk = true; continue; }
    if (['yarın', 'yarin', 'tomorrow', 'tmr'].includes(t)) { day = addDays(today, 1); i++; bareHourOk = true; continue; }
    if (['öbürgün', 'obur', 'öbür'].includes(t)) { day = addDays(today, 2); i += peek(1) === 'gün' || peek(1) === 'gun' ? 2 : 1; bareHourOk = true; continue; }
    if (t === 'yarından' || t === 'yarindan') { if (peek(1) === 'sonra') { day = addDays(today, 2); i += 2; bareHourOk = true; continue; } return null; }
    if (['haftaya', 'next'].includes(t)) { nextWeek = true; i++; if (t === 'next' && peek() === 'week') { day = addDays(today, 7); i++; } else if (t === 'haftaya' && !(peek() in WD)) day = addDays(today, 7); continue; }
    if (t === 'in' && /^\d+$/.test(peek(1) ?? '')) { i++; continue; }
    if (/^\d+$/.test(t) && ['gün', 'gun', 'day', 'days', 'hafta', 'week', 'weeks'].includes(peek(1) ?? '')) {
      const n = Number(t), u = peek(1)!; day = addDays(today, n * (/^(hafta|week)/.test(u) ? 7 : 1)); i += 2; if (['sonra', 'later'].includes(peek() ?? '')) i++; bareHourOk = true; continue;
    }
    if (t in WD) {
      const target = WD[t], cur = weekdayOf(today);
      let diff = (target - cur + 7) % 7; if (diff === 0) diff = 7;
      if (nextWeek && diff < 7) diff += cur < target ? 7 : 0;
      day = addDays(today, diff); i++; bareHourOk = true; continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) { day = t; i++; bareHourOk = true; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(t)) && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31 && (m[3] || day == null)) {
      const d = Number(m[1]), mo = Number(m[2]) - 1; let y = m[3] ? Number(m[3]) : parseKey(today).y; if (y < 100) y += 2000;
      day = key(y, mo, d); if (!m[3] && day < today) day = key(y + 1, mo, d); i++; bareHourOk = true; continue;
    }
    if (/^\d{1,2}$/.test(t) && (peek(1) ?? '') in MONTHS) {
      const d = Number(t), mo = MONTHS[peek(1)!]; i += 2; let y = parseKey(today).y;
      if (/^\d{4}$/.test(peek() ?? '')) { y = Number(peek()); i++; }
      day = key(y, mo, Math.min(d, 31)); if (day < today && !/^\d{4}$/.test(toks[i - 1])) day = key(y + 1, mo, d); bareHourOk = true; continue;
    }
    if (t in MONTHS && /^\d{1,2}$/.test(peek(1) ?? '')) {
      const mo = MONTHS[t], d = Number(peek(1)); i += 2; let y = parseKey(today).y;
      if (/^\d{4}$/.test(peek() ?? '')) { y = Number(peek()); i++; }
      day = key(y, mo, d); if (day < today && !/^\d{4}$/.test(toks[i - 1])) day = key(y + 1, mo, d); bareHourOk = true; continue;
    }
    if (['saat', 'at', '@'].includes(t)) { i++; bareHourOk = true; continue; }
    if (['sabah', 'morning'].includes(t)) { pm = 'am'; if (h == null) h = 9; i++; bareHourOk = true; continue; }
    if (['öğlen', 'öğle', 'oglen', 'noon'].includes(t)) { h = 12; mi = 0; i++; continue; }
    if (['akşam', 'aksam', 'evening', 'tonight'].includes(t)) { pm = 'pm'; if (h == null) h = 19; if (!day) day = today; i++; bareHourOk = true; continue; }
    if (['öğleden', 'afternoon'].includes(t)) { pm = 'pm'; if (h == null) h = 15; i += peek(1) === 'sonra' ? 2 : 1; bareHourOk = true; continue; }
    if (['gece', 'night'].includes(t)) { pm = 'pm'; if (h == null) h = 22; i++; bareHourOk = true; continue; }
    if ((m = /^(\d{1,2})[:.](\d{2})(am|pm)?$/.exec(t))) { h = Number(m[1]); mi = Number(m[2]); if (m[3]) pm = m[3] as 'am' | 'pm'; i++; continue; }
    if ((m = /^(\d{1,2})(am|pm)$/.exec(t))) { h = Number(m[1]); mi = 0; pm = m[2] as 'am' | 'pm'; i++; continue; }
    if (/^\d{1,2}$/.test(t) && bareHourOk && Number(t) <= 23) { h = Number(t); mi = 0; i++; if (['am', 'pm'].includes(peek() ?? '')) { pm = peek() as 'am' | 'pm'; i++; } continue; }
    return null;
  }
  if (h != null) {
    if (pm === 'pm' && h < 12) h += 12;
    if (pm === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    if (!day) day = today;
  }
  if (!day) return null;
  const time = h != null ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null;
  const rel = day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : `${WEEKDAYS_SHORT[weekdayOf(day)]} ${formatShort(day)}`;
  return { day, time, label: time ? `${rel} ${time}` : rel };
}
