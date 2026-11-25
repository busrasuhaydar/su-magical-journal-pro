// Ana sayfa özel kartları (sayfa, koleksiyon, etiket, görsel/eser, alıntı, sayaç, hızlı not) ve kayıtlı düzenler (ör. "Sabah", "Stüdyo").
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, FileText, Gem, Hash, Hourglass, ImageIcon, LayoutGrid, Plus, Quote, RotateCcw, Save, SkipForward, StickyNote, Trash2, type LucideIcon } from 'lucide-react';
import { useAllPages, useCompleteTask, useJournal, useOpportunities, useOppDates, useOverdue, usePageBlocks, useProfile, useTasks } from '../lib/data';
import { OPEN_STATUSES, PRIORITY_ORDER, type Task } from '../lib/types';
import { getPref, setPref } from '../lib/prefs';
import { useEditors } from '../components/Editors';
import { useNfts } from '../lib/nft';
import { useTagLinks, useTags, TAG_ENTITY_LABEL } from '../lib/tags';
import { useArtworks } from '../lib/artworks';
import { ArtImage } from '../components/ArtImage';
import { Dialog, Field, useToast } from '../components/ui';
import { usePrefsWriter } from '../lib/ui';
import type { CustomCard, ScreenLayout, UseLayout } from '../lib/layout';
import { addDays, todayKey, formatLong } from '../lib/dates';

export const CARD_TYPES: [CustomCard['type'], string, LucideIcon][] = [
  ['page', 'Page', FileText], ['collection', 'Collection view', Gem], ['tag', 'Tag list', Hash], ['image', 'Image / artwork', ImageIcon],
  ['quote', 'Quote', Quote], ['counter', 'Counter', Hourglass], ['note', 'Quick note', StickyNote],
];
export const cardLabel = (c: CustomCard) => CARD_TYPES.find((t) => t[0] === c.type)?.[1] ?? 'Card';
export const cardIcon = (c: CustomCard) => CARD_TYPES.find((t) => t[0] === c.type)?.[2] ?? LayoutGrid;

function PageCard({ id }: { id: string }) {
  const pages = useAllPages();
  const blocks = usePageBlocks(id);
  const pg = pages.data?.find((p) => p.id === id);
  if (!pg) return <p className="small muted">Page not found.</p>;
  const text = (blocks.data ?? []).map((b) => b.content.text ?? '').filter(Boolean).join(' ').replace(/\[\[page:[^|\]]+\|([^\]]+)\]\]/g, '$1').slice(0, 260);
  return <Link to={`/pages/${pg.id}`} className="hc-page"><b>{pg.icon ?? '📄'} {pg.title}</b><span className="small muted">{text || 'Empty page'}</span></Link>;
}
function CollectionCard({ slug }: { slug: string }) {
  const nfts = useNfts();
  const items = (nfts.data?.items ?? []).filter((n) => n.c === slug && n.thumb).slice(0, 6);
  return (
    <div className="hc-grid">
      {items.map((n) => <Link key={n.contract + n.tokenId} to={`/collections/${slug}`} className="hc-thumb"><img src={n.thumb!} alt={n.name} loading="lazy" /></Link>)}
      {!items.length && <p className="small muted">No artworks.</p>}
    </div>
  );
}
function TagCard({ id }: { id: string }) {
  const links = useTagLinks();
  const counts = new Map<string, number>();
  (links.data ?? []).filter((l) => l.tag_id === id).forEach((l) => counts.set(l.entity_type, (counts.get(l.entity_type) ?? 0) + 1));
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {[...counts].map(([k, n]) => <Link key={k} to={`/tags/${id}`} className="chip">{TAG_ENTITY_LABEL[k as keyof typeof TAG_ENTITY_LABEL]} · {n}</Link>)}
      {!counts.size && <Link to={`/tags/${id}`} className="small">Nothing tagged yet →</Link>}
    </div>
  );
}
function ImageCard({ id }: { id: string }) {
  const arts = useArtworks();
  const a = arts.data?.find((x) => x.id === id);
  if (!a) return <p className="small muted">Artwork not found.</p>;
  return <Link to={`/artworks/${a.id}`} className="hc-img"><ArtImage a={a} /><span className="small">{a.title}</span></Link>;
}
function Counter({ c }: { c: CustomCard }) {
  if (!c.date) return <p className="small muted">Pick a date.</p>;
  const d = Math.round((new Date(c.date + 'T00:00:00').getTime() - new Date(todayKey() + 'T00:00:00').getTime()) / 86400000);
  return <div className="hc-count"><b className="mono">{Math.abs(d)}</b><span>{d === 0 ? 'Today!' : d > 0 ? 'days to go' : 'days since'}<small className="muted"> · {formatLong(c.date)}</small></span></div>;
}
function NoteCard({ c, onSave }: { c: CustomCard; onSave: (t: string) => void }) {
  const [v, setV] = useState(c.text ?? '');
  const t = useRef<number>();
  useEffect(() => { setV(c.text ?? ''); }, [c.text]);
  return <textarea className="textarea hc-note" rows={4} value={v} placeholder="Write a quick note…" aria-label="Quick note"
    onChange={(e) => { const x = e.target.value; setV(x); clearTimeout(t.current); t.current = window.setTimeout(() => onSave(x), 700); }} onBlur={() => v !== (c.text ?? '') && onSave(v)} />;
}

export function CustomCardView({ c, lay }: { c: CustomCard; lay: UseLayout }) {
  const save = (patch: Partial<CustomCard>) => lay.set((l) => ({ ...l, custom: (l.custom ?? []).map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));
  switch (c.type) {
    case 'page': return c.ref ? <PageCard id={c.ref} /> : null;
    case 'collection': return c.ref ? <CollectionCard slug={c.ref} /> : null;
    case 'tag': return c.ref ? <TagCard id={c.ref} /> : null;
    case 'image': return c.ref ? <ImageCard id={c.ref} /> : null;
    case 'quote': return <blockquote className="hc-quote">“{c.text}”</blockquote>;
    case 'counter': return <Counter c={c} />;
    case 'note': return <NoteCard c={c} onSave={(text) => save({ text })} />;
  }
}

export function AddCardDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (c: CustomCard, title: string) => void }) {
  const [type, setType] = useState<CustomCard['type']>('page');
  const [ref, setRef] = useState('');
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayKey());
  const [title, setTitle] = useState('');
  const pages = useAllPages();
  const nfts = useNfts();
  const tags = useTags();
  const arts = useArtworks();
  const cols = nfts.data?.collections ?? [];
  const opts: [string, string][] = type === 'page' ? (pages.data ?? []).filter((p) => !p.journal_day).map((p) => [p.id, `${p.icon ?? '📄'} ${p.title}`])
    : type === 'collection' ? cols.map((c) => [c.slug, c.name]) : type === 'tag' ? (tags.data ?? []).map((t) => [t.id, `#${t.name}`])
      : type === 'image' ? (arts.data ?? []).map((a) => [a.id, a.title]) : [];
  const needsRef = ['page', 'collection', 'tag', 'image'].includes(type);
  const ok = needsRef ? !!ref : type === 'quote' ? !!text.trim() : type === 'counter' ? !!date && !!title.trim() : true;
  function add() {
    const auto = opts.find((o) => o[0] === ref)?.[1];
    onAdd({ id: `c_${Date.now().toString(36)}`, type, ref: ref || undefined, text: text.trim() || undefined, date: type === 'counter' ? date : undefined }, title.trim() || auto || CARD_TYPES.find((t) => t[0] === type)![1]);
    onClose();
  }
  return (
    <Dialog title="Add card" onClose={onClose}>
      <div className="hc-types" role="radiogroup" aria-label="Card type">
        {CARD_TYPES.map(([k, l, I]) => <button key={k} type="button" role="radio" aria-checked={type === k} className={`hc-type${type === k ? ' on' : ''}`} onClick={() => { setType(k); setRef(''); }}><I size={18} /><span>{l}</span></button>)}
      </div>
      {needsRef && (
        <Field label="Choose">
          <select className="select" value={ref} onChange={(e) => setRef(e.target.value)}>
            <option value="">—</option>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      )}
      {type === 'quote' && <Field label="Quote"><textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
      {type === 'counter' && <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      <Field label={type === 'counter' ? 'Name (e.g. Exhibition opening)' : 'Card title (optional)'}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={add} disabled={!ok}><Plus size={14} />Add card</button>
      </div>
    </Dialog>
  );
}

/** Kayıtlı ana sayfa düzenleri: tek dokunuşla geçiş, düzenleme modunda kaydet/sil. */
export function PresetBar({ editing }: { editing: boolean }) {
  const ui = useProfile().data?.ui_prefs ?? {};
  const write = usePrefsWriter();
  const presets = ui.home_presets ?? {};
  const names = Object.keys(presets);
  const active = ui.home_active ?? '';
  const [nm, setNm] = useState('');
  if (!editing && !names.length) return null;
  const use = (n: string) => write((u) => ({ ...u, home_active: n, layout: { ...(u.layout ?? {}), home: structuredClone(u.home_presets?.[n] ?? {}) as ScreenLayout } }));
  const save = (n: string) => { const k = n.trim(); if (!k) return; write((u) => ({ ...u, home_active: k, home_presets: { ...(u.home_presets ?? {}), [k]: structuredClone(u.layout?.home ?? {}) } })); setNm(''); };
  const del = (n: string) => write((u) => { const p = { ...(u.home_presets ?? {}) }; delete p[n]; return { ...u, home_presets: p, home_active: u.home_active === n ? '' : u.home_active }; });
  return (
    <div className="hc-presets" role="group" aria-label="Saved layouts">
      <LayoutGrid size={15} className="muted" />
      {names.map((n) => (
        <span key={n} className={`chip hc-preset${active === n ? ' on' : ''}`}>
          <button type="button" onClick={() => use(n)} aria-pressed={active === n}>{active === n && <Check size={12} />}{n}</button>
          {editing && <button type="button" aria-label={`Delete layout ${n}`} onClick={() => del(n)}><Trash2 size={12} /></button>}
        </span>
      ))}
      {editing && active && names.includes(active) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(active)}><Save size={13} />Update “{active}”</button>}
      {editing && (
        <span className="row" style={{ gap: 6 }}>
          <input className="input hc-preset-in" value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save(nm)} placeholder="Layout name (e.g. Morning)" aria-label="New layout name" />
          <button type="button" className="btn btn-glass btn-sm" onClick={() => save(nm)} disabled={!nm.trim()}><Save size={13} />Save layout</button>
        </span>
      )}
    </div>
  );
}

/** "Şimdi ne yapmalıyım?": tek öneri. Gecikmiş görev → 3 gün içindeki son başvuru → günün hedefi → en öncelikli açık görev. */
export function NowCard({ title }: { title: string }) {
  const today = todayKey();
  const overdue = useOverdue();
  const dates = useOppDates();
  const opps = useOpportunities();
  const tasks = useTasks();
  const j = useJournal(today);
  const complete = useCompleteTask();
  const toast = useToast();
  const { openTask } = useEditors();
  const skipKey = `now-skip:${today}`;
  const [skip, setSkip] = useState<string[]>(() => { try { return JSON.parse(getPref(skipKey, '[]')); } catch { return []; } });
  const doSkip = (id: string) => { const n = [...skip, id]; setSkip(n); setPref(skipKey, JSON.stringify(n)); };
  type S = { id: string; kind: string; title: string; sub: string; task?: Task; href?: string };
  const cands: S[] = [];
  (overdue.data ?? []).forEach((t) => cands.push({ id: t.id, kind: 'Overdue', title: t.title, sub: `Was due ${t.due_date ? formatLong(t.due_date) : 'earlier'}`, task: t }));
  (dates.data ?? []).filter((d) => d.kind === 'deadline' && d.day >= today && d.day <= addDays(today, 3)).sort((a, b) => a.day.localeCompare(b.day)).forEach((d) => {
    const o = opps.data?.find((x) => x.id === d.opportunity_id);
    if (o && !['submitted', 'awaiting', 'accepted', 'rejected', 'exhibiting', 'completed', 'withdrawn'].includes(o.status)) cands.push({ id: d.id, kind: 'Deadline soon', title: o.title, sub: `Application deadline ${formatLong(d.day)}`, href: `/opportunities/${o.id}` });
  });
  if (j.data?.day?.goal) cands.push({ id: `goal-${today}`, kind: 'Today’s goal', title: j.data.day.goal, sub: 'Your goal for today', href: `/day/${today}` });
  (tasks.data ?? []).filter((t) => OPEN_STATUSES.includes(t.status) && (!t.due_date || t.due_date >= today)).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
    .slice(0, 20).forEach((t) => cands.push({ id: t.id, kind: 'Top priority', title: t.title, sub: t.due_date ? `Due ${formatLong(t.due_date)}` : 'No date', task: t }));
  const s = cands.find((c) => !skip.includes(c.id));
  async function done() {
    if (!s) return;
    if (s.task) { try { await complete.mutateAsync({ id: s.task.id, done: true }); toast.ok('Done ✓'); } catch (x) { toast.fail(x); } }
    else doSkip(s.id);
  }
  return (
    <section className="glass panel now-next">
      <div className="panel-head"><h2>{title}</h2>{skip.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSkip([]); setPref(skipKey, '[]'); }}><RotateCcw size={13} />Reset</button>}</div>
      {!s ? <p className="small muted">Nothing urgent. Enjoy creating ✦</p> : (
        <div className="nn-body">
          <span className="nn-kind">{s.kind}</span>
          {s.href ? <Link to={s.href} className="nn-title">{s.title}</Link> : <button type="button" className="nn-title" onClick={() => s.task && openTask(s.task)}>{s.title}</button>}
          <span className="small muted">{s.sub}</span>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={done}><Check size={14} />Done</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => doSkip(s.id)}><SkipForward size={14} />Skip</button>
          </div>
        </div>
      )}
    </section>
  );
}
