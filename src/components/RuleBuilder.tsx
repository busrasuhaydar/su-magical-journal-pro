// Görev düzenleyicide "Özel" tekrar: her N gün/hafta/ay/yıl, haftanın günleri, ayın N'inci / son X günü, ayın N. günü.
import { BYDAY_LABEL, buildRule, describeRule, nextOccurrence, parseRule, type Rule } from '../lib/rrule';
import { formatLong, todayKey } from '../lib/dates';

export function RuleBuilder({ value, onChange, start }: { value: string; onChange: (r: string) => void; start?: string }) {
  const r: Rule = parseRule(value) ?? { freq: 'WEEKLY', interval: 1, byday: [], bymonthday: null };
  const set = (p: Partial<Rule>) => onChange(buildRule({ ...r, ...p }));
  const mMode = r.byday.length ? 'weekday' : r.bymonthday ? 'day' : 'same';
  const nb = r.byday[0] ?? { n: 1, d: 0 };
  const nxt = nextOccurrence(buildRule(r), start || todayKey());
  return (
    <div className="card rule-box">
      <div className="row" style={{ gap: 6 }}>
        <span className="small">Every</span>
        <input className="input" type="number" min={1} max={99} style={{ width: 70 }} value={r.interval} onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} aria-label="Interval" />
        <select className="select" style={{ width: 'auto' }} value={r.freq} onChange={(e) => set({ freq: e.target.value as Rule['freq'], byday: [], bymonthday: null })} aria-label="Unit">
          <option value="DAILY">day(s)</option><option value="WEEKLY">week(s)</option><option value="MONTHLY">month(s)</option><option value="YEARLY">year(s)</option>
        </select>
      </div>
      {r.freq === 'WEEKLY' && (
        <div className="rule-days" role="group" aria-label="Days of the week">
          {BYDAY_LABEL.map((l, d) => {
            const on = r.byday.some((b) => b.d === d);
            return <button key={l} type="button" className={`chip${on ? ' chip-on' : ''}`} aria-pressed={on} onClick={() => set({ byday: on ? r.byday.filter((b) => b.d !== d) : [...r.byday, { n: null, d }].sort((a, b) => a.d - b.d) })}>{l}</button>;
          })}
        </div>
      )}
      {r.freq === 'MONTHLY' && (
        <div className="row" style={{ gap: 6 }}>
          <select className="select" style={{ width: 'auto' }} value={mMode} aria-label="Monthly on"
            onChange={(e) => set(e.target.value === 'weekday' ? { byday: [{ n: 1, d: 0 }], bymonthday: null } : e.target.value === 'day' ? { byday: [], bymonthday: 1 } : { byday: [], bymonthday: null })}>
            <option value="same">same day as the date</option><option value="day">on day…</option><option value="weekday">on the …</option>
          </select>
          {mMode === 'day' && (
            <select className="select" style={{ width: 'auto' }} value={r.bymonthday ?? 1} onChange={(e) => set({ bymonthday: Number(e.target.value) })} aria-label="Day of month">
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}<option value={-1}>last day</option>
            </select>
          )}
          {mMode === 'weekday' && <>
            <select className="select" style={{ width: 'auto' }} value={nb.n ?? 1} onChange={(e) => set({ byday: [{ n: Number(e.target.value), d: nb.d }] })} aria-label="Which">
              <option value={1}>first</option><option value={2}>second</option><option value={3}>third</option><option value={4}>fourth</option><option value={-1}>last</option>
            </select>
            <select className="select" style={{ width: 'auto' }} value={nb.d} onChange={(e) => set({ byday: [{ n: nb.n, d: Number(e.target.value) }] })} aria-label="Weekday">
              {BYDAY_LABEL.map((l, d) => <option key={l} value={d}>{l}</option>)}
            </select>
          </>}
        </div>
      )}
      <span className="small muted">{describeRule(buildRule(r))}{nxt ? ` · next: ${formatLong(nxt)}` : ''}</span>
    </div>
  );
}
