// Exhibitions & Opportunities: başvuru hattı, duyurudan otomatik kayıt, hazırlık planı ve hatırlatıcılar.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Bell, BriefcaseBusiness, CalendarClock, CheckCircle2, Copy, ExternalLink, FileDown, FileText, Link2, Plus, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react';
import { copyText, kitName, useKit, type KitItem } from '../lib/kit';
import { TagPicker } from '../components/TagPicker';
import { PageHead } from '../components/Shell';
import { TaskRow } from '../components/TaskRow';
import { useEditors } from '../components/Editors';
import { ConfirmButton, Dialog, Empty, Field, useToast } from '../components/ui';
import { MediaSources } from '../components/Media';
import { linkFile, uploadFile, useFiles, useOppDates, useOpportunities, useProjectOpps, useProjects, useRowMutation, useSignedUrl, useTasks } from '../lib/data';
import { supabase } from '../lib/supabase';
import { addDays, daysBetween, formatLong, formatRelative, formatShort, todayKey } from '../lib/dates';
import { CONFIRMED_OPP, OPP_DATE_LABEL, OPP_KIND_LABEL, OPP_STATUS_COLOR, OPP_STATUS_LABEL, type FileRec, type OppDate, type OppDateKind, type OppKind, type OppStatus, type Opportunity, type RequiredDoc } from '../lib/types';

const PIPE: OppStatus[] = ['to_review', 'potential', 'preparing', 'submitted', 'awaiting', 'accepted', 'exhibiting', 'completed', 'rejected', 'withdrawn'];
const DATE_KINDS = Object.keys(OPP_DATE_LABEL) as OppDateKind[];
const CUR = ['TRY', 'USD', 'EUR', 'GBP'];
const fmtMoney = (n: number, c: string | null) => n.toLocaleString('en-US', { style: 'currency', currency: c ?? 'TRY', maximumFractionDigits: 2 });

// ── List ──────────────────────────────────────────────
export default function OpportunitiesPage() {
  const { id } = useParams();
  return id ? <OpportunityDetail id={id} /> : <OpportunityList />;
}

function OpportunityList() {
  const opps = useOpportunities();
  const dates = useOppDates();
  const nav = useNavigate();
  const [intake, setIntake] = useState(false);
  const [view, setView] = useState<'pipe' | 'list'>('pipe');
  const [kind, setKind] = useState('');
  const today = todayKey();
  const list = (opps.data ?? []).filter((o) => !kind || o.kind === kind);
  const deadline = (o: Opportunity) => dates.data?.find((d) => d.opportunity_id === o.id && d.kind === 'deadline');
  const soon = (dates.data ?? []).filter((d) => d.day >= today && d.day <= addDays(today, 30) && list.some((o) => o.id === d.opportunity_id)).slice(0, 8);

  const Card = ({ o }: { o: Opportunity }) => {
    const dl = deadline(o);
    const left = dl ? daysBetween(today, dl.day) : null;
    const confirmed = CONFIRMED_OPP.includes(o.status);
    return (
      <Link to={`/opportunities/${o.id}`} className={`opp-card${confirmed ? ' confirmed' : ''}`}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}><span className="chip" style={{ padding: '1px 8px' }}>{OPP_KIND_LABEL[o.kind]}</span>{confirmed && <span className="small" style={{ color: 'var(--ok)', fontWeight: 700 }}>✓ Confirmed</span>}</div>
        <b>{o.title}</b>
        <span className="small muted">{[o.organization ?? o.gallery, o.city, o.country].filter(Boolean).join(' · ') || '—'}</span>
        {dl && <span className="small" style={{ color: left! < 0 ? 'var(--ink-500)' : left! <= 7 ? 'var(--bad)' : left! <= 30 ? 'var(--orange-600)' : 'var(--ink-700)', fontWeight: 600 }}>
          <CalendarClock size={12} /> Application deadline {formatShort(dl.day)}{left! >= 0 ? ` · ${left} days` : ' · past'}{dl.certainty !== 'confirmed' ? ' (unconfirmed)' : ''}</span>}
        {o.required_docs.length > 0 && <div className="prog" style={{ height: 4 }}><b style={{ width: `${(o.required_docs.filter((d) => d.done).length / o.required_docs.length) * 100}%` }} /></div>}
      </Link>
    );
  };

  return (
    <>
      <PageHead title="Exhibitions & Opportunities">
        <div className="seg"><button type="button" className={view === 'pipe' ? 'on' : ''} onClick={() => setView('pipe')}>Application pipeline</button><button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button></div>
        <button type="button" className="btn btn-glass" onClick={() => setIntake(true)}><Plus size={15} />Add manually</button>
        <button type="button" className="btn btn-primary" onClick={() => setIntake(true)}><Wand2 size={15} />Add from announcement</button>
      </PageHead>
      {soon.length > 0 && (
        <section className="glass panel">
          <div className="panel-head"><h2>Next 30 days</h2></div>
          <div className="row">{soon.map((d) => { const o = list.find((x) => x.id === d.opportunity_id)!; return (
            <button type="button" key={d.id} className="chip" style={{ cursor: 'pointer', padding: '7px 12px', borderStyle: d.certainty === 'confirmed' ? 'solid' : 'dashed' }} onClick={() => nav(`/opportunities/${o.id}`)}>
              <b>{formatShort(d.day)}</b> · {OPP_DATE_LABEL[d.kind]} · {o.title}
            </button>); })}</div>
        </section>
      )}
      <div className="row">
        <select id="ok-kind" className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{Object.entries(OPP_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="small muted">Dashed cards are potential opportunities; solid ones are confirmed exhibitions.</span>
      </div>
      {!opps.isLoading && list.length === 0 && <section className="glass panel"><Empty title="No opportunities yet">Paste an open call text, upload a PDF or give a link; dates, requirements and preparation tasks are extracted automatically.</Empty></section>}
      {view === 'pipe' && list.length > 0 && (
        <div className="pipe">
          {PIPE.filter((s) => list.some((o) => o.status === s) || ['to_review', 'potential', 'preparing', 'submitted', 'awaiting', 'accepted'].includes(s)).map((s) => (
            <div key={s} className="pipe-col">
              <div className="kcol-head"><i className="dot" style={{ background: OPP_STATUS_COLOR[s] }} /><b className="small">{OPP_STATUS_LABEL[s]}</b><span className="count">{list.filter((o) => o.status === s).length}</span></div>
              {list.filter((o) => o.status === s).map((o) => <Card key={o.id} o={o} />)}
            </div>
          ))}
        </div>
      )}
      {view === 'list' && <div className="cards">{list.map((o) => <Card key={o.id} o={o} />)}</div>}
      {intake && <IntakeDialog onClose={() => setIntake(false)} onCreated={(newId) => nav(`/opportunities/${newId}`)} />}
    </>
  );
}

// ── Duyurudan ekleme ───────────────────────────────────
type Extracted = {
  title: string; kind: OppKind; organization?: string | null; gallery?: string | null; city?: string | null; country?: string | null;
  fee_amount?: number | null; fee_currency?: string | null; fee_note?: string | null; requirements?: string | null; artwork_requirements?: string | null;
  required_documents: string[]; application_url?: string | null; contact?: { name?: string | null; email?: string | null; phone?: string | null };
  dates: { kind: OppDateKind; date: string; time?: string | null; certainty: 'confirmed' | 'uncertain' | 'conflicting'; evidence: string }[];
  suggested_tasks: { title: string; days_before_deadline: number; reason?: string }[]; warnings: string[]; confidence?: Record<string, string>;
};
const EMPTY: Extracted = { title: '', kind: 'open_call', required_documents: [], dates: [], suggested_tasks: [], warnings: [] };

function toB64(file: File) {
  return new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
}

function IntakeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'text' | 'pdf' | 'url' | 'manual'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ex, setEx] = useState<Extracted | null>(null);
  const [src, setSrc] = useState<{ text: string | null; url: string | null }>({ text: null, url: null });
  const [makeTasks, setMakeTasks] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  async function analyze() {
    setErr(''); setBusy(true);
    try {
      const body: Record<string, string> = {};
      if (mode === 'text') { if (text.trim().length < 40) throw new Error('Paste a somewhat longer announcement text.'); body.text = text; }
      if (mode === 'url') { let u = url.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; new URL(u); body.url = u; }
      if (mode === 'pdf') { if (!pdf) throw new Error('Choose a PDF.'); if (pdf.size > 20 * 1024 * 1024) throw new Error('PDF can be at most 20 MB.'); body.pdf_base64 = await toB64(pdf); }
      const { data, error } = await supabase.functions.invoke('extract-opportunity', { body });
      if (error) {
        let msg = error.message;
        try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* yok say */ }
        throw new Error(msg);
      }
      setEx({ ...EMPTY, ...data.data });
      setSrc({ text: data.source_text ?? (mode === 'text' ? text : null), url: mode === 'url' ? body.url : null });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  async function create() {
    if (!ex || !ex.title.trim()) return setErr('Title is required.');
    setBusy(true);
    try {
      let source_file_id: string | null = null;
      if (pdf) { const { rec } = await uploadFile(pdf); source_file_id = rec.id; }
      const { data: o, error } = await supabase.from('opportunities').insert({
        title: ex.title.trim(), kind: ex.kind, organization: ex.organization || null, gallery: ex.gallery || null, city: ex.city || null, country: ex.country || null,
        fee_amount: ex.fee_amount ?? null, fee_currency: ex.fee_amount != null ? ex.fee_currency || 'TRY' : null, fee_note: ex.fee_note || null,
        requirements: ex.requirements || null, artwork_requirements: ex.artwork_requirements || null,
        required_docs: ex.required_documents.map((label) => ({ label, done: false })), application_url: ex.application_url || null,
        contact: ex.contact ?? {}, status: 'to_review', source_text: src.text, source_url: src.url, source_file_id,
        extraction: mode === 'manual' ? null : { warnings: ex.warnings, confidence: ex.confidence ?? {}, suggested_tasks: ex.suggested_tasks, at: new Date().toISOString() },
      }).select().single();
      if (error) throw error;
      if (ex.dates.length) {
        const seen = new Set<string>();
        const rows = ex.dates.filter((d) => !seen.has(d.kind) && seen.add(d.kind)).map((d) => ({ opportunity_id: o.id, kind: d.kind, day: d.date, time_text: d.time || null, certainty: d.certainty, evidence: d.evidence || null }));
        const { error: e2 } = await supabase.from('opportunity_dates').insert(rows); if (e2) throw e2;
      }
      const dl = ex.dates.find((d) => d.kind === 'deadline');
      if (makeTasks && ex.suggested_tasks.length) {
        const rows = ex.suggested_tasks.map((t) => ({ title: t.title, description: t.reason ?? null, opportunity_id: o.id, category: 'Application', priority: 'high',
          due_date: dl ? clampDue(addDays(dl.date, -Math.max(0, t.days_before_deadline))) : null, source: 'ai' }));
        const { error: e3 } = await supabase.from('tasks').insert(rows); if (e3) throw e3;
      }
      ['opps', 'tasks', 'cal', 'year'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.ok('Opportunity created; dates added to the calendar, reminders queued');
      onClose(); onCreated(o.id);
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }

  const set = <K extends keyof Extracted>(k: K, v: Extracted[K]) => setEx((s) => (s ? { ...s, [k]: v } : s));
  return (
    <Dialog title={ex ? 'Review and save' : 'New opportunity'} onClose={onClose} wide>
      {!ex ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="seg">{([['text', 'Paste text'], ['pdf', 'Upload PDF'], ['url', 'Link'], ['manual', 'Enter manually']] as const).map(([k, l]) => <button type="button" key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
          {mode === 'text' && <textarea id="in-text" className="textarea" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full text of the open call, exhibition or competition announcement here…" />}
          {mode === 'url' && <input id="in-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… announcement page" />}
          {mode === 'pdf' && <div className="dropzone"><button type="button" className="btn btn-glass btn-sm" onClick={() => input.current?.click()}><Upload size={14} />Choose PDF</button> {pdf?.name}<input ref={input} id="in-pdf" type="file" accept="application/pdf" hidden onChange={(e) => setPdf(e.target.files?.[0] ?? null)} /></div>}
          {mode !== 'manual' && <p className="small muted" style={{ margin: 0 }}>The AI only extracts what the source says. Unclear or conflicting information is flagged; missing dates are not invented. You can check everything before saving.</p>}
          {err && <div className="error">{err}</div>}
          <div className="foot"><span /><div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            {mode === 'manual' ? <button type="button" className="btn btn-primary" onClick={() => setEx({ ...EMPTY })}>Continue</button>
              : <button type="button" className="btn btn-primary" disabled={busy} onClick={analyze}><Sparkles size={15} />{busy ? 'Analyzing…' : 'Analyze'}</button>}
          </div></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {ex.warnings.length > 0 && <div className="warn-box"><b className="row" style={{ gap: 6 }}><AlertTriangle size={15} />Things to watch out for</b><ul>{ex.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
          <div className="grid-3">
            <div style={{ gridColumn: 'span 2' }}><Field label={`Title${conf(ex, 'title')}`}><input id="ex-title" className="input" value={ex.title} onChange={(e) => set('title', e.target.value)} /></Field></div>
            <Field label="Type"><select id="ex-kind" className="select" value={ex.kind} onChange={(e) => set('kind', e.target.value as OppKind)}>{Object.entries(OPP_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Organization"><input id="ex-org" className="input" value={ex.organization ?? ''} onChange={(e) => set('organization', e.target.value)} /></Field>
            <Field label="City"><input id="ex-city" className="input" value={ex.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Country"><input id="ex-country" className="input" value={ex.country ?? ''} onChange={(e) => set('country', e.target.value)} /></Field>
            <Field label={`Fee${conf(ex, 'fee')}`}><input id="ex-fee" className="input" inputMode="decimal" value={ex.fee_amount ?? ''} onChange={(e) => set('fee_amount', e.target.value === '' ? null : Number(e.target.value.replace(',', '.')))} placeholder="None / unknown" /></Field>
            <Field label="Currency"><select id="ex-cur" className="select" value={ex.fee_currency ?? 'TRY'} onChange={(e) => set('fee_currency', e.target.value)}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Application URL"><input id="ex-url" className="input" value={ex.application_url ?? ''} onChange={(e) => set('application_url', e.target.value)} /></Field>
          </div>
          <div>
            <b className="small">Dates{conf(ex, 'dates')}</b>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              {ex.dates.map((d, i) => (
                <div key={i} className="date-row" style={{ borderColor: d.certainty === 'confirmed' ? undefined : 'var(--orange-500)' }}>
                  <select id={`exd-k-${i}`} className="select" value={d.kind} onChange={(e) => set('dates', ex.dates.map((x, j) => (j === i ? { ...x, kind: e.target.value as OppDateKind } : x)))}>{DATE_KINDS.map((k) => <option key={k} value={k}>{OPP_DATE_LABEL[k]}</option>)}</select>
                  <input id={`exd-d-${i}`} type="date" className="input" value={d.date} onChange={(e) => set('dates', ex.dates.map((x, j) => (j === i ? { ...x, date: e.target.value, certainty: 'confirmed' as const } : x)))} />
                  <span className="small" style={{ color: d.certainty === 'confirmed' ? 'var(--ok)' : 'var(--orange-600)', fontWeight: 600 }}>{d.certainty === 'confirmed' ? 'Confirmed' : d.certainty === 'uncertain' ? 'Unclear' : 'Conflicting'}{d.time ? ` · ${d.time}` : ''}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('dates', ex.dates.filter((_, j) => j !== i))}>Remove</button>
                  {d.evidence && <q className="small muted" style={{ gridColumn: '1 / -1' }}>{d.evidence}</q>}
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => set('dates', [...ex.dates, { kind: 'deadline', date: todayKey(), certainty: 'confirmed', evidence: '' }])}><Plus size={13} />Add date</button>
            </div>
          </div>
          <div className="grid-2">
            <Field label={`Participation requirements${conf(ex, 'requirements')}`}><textarea id="ex-req" className="textarea" value={ex.requirements ?? ''} onChange={(e) => set('requirements', e.target.value)} /></Field>
            <Field label="Artwork requirements"><textarea id="ex-art" className="textarea" value={ex.artwork_requirements ?? ''} onChange={(e) => set('artwork_requirements', e.target.value)} /></Field>
          </div>
          <Field label="Required documents (one per line)"><textarea id="ex-docs" className="textarea" value={ex.required_documents.join('\n')} onChange={(e) => set('required_documents', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} /></Field>
          {ex.suggested_tasks.length > 0 && (
            <div className="card" style={{ display: 'grid', gap: 6 }}>
              <label className="row small" style={{ gap: 8, cursor: 'pointer' }}><input id="ex-mk" type="checkbox" checked={makeTasks} onChange={(e) => setMakeTasks(e.target.checked)} /><b>Create preparation tasks ({ex.suggested_tasks.length}) · planned backwards from the deadline</b></label>
              {makeTasks && ex.suggested_tasks.map((t, i) => <span key={i} className="small">• {t.title} <span className="muted">· {t.days_before_deadline} days before the deadline</span></span>)}
            </div>
          )}
          {err && <div className="error">{err}</div>}
          <div className="foot"><button type="button" className="btn btn-ghost" onClick={() => setEx(null)}><ArrowLeft size={14} />Back</button><div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Saving…' : 'Create opportunity'}</button>
          </div></div>
        </div>
      )}
    </Dialog>
  );
}
const conf = (ex: Extracted, k: string) => { const c = ex.confidence?.[k]; return c === 'low' ? ' · low confidence' : c === 'medium' ? ' · medium confidence' : ''; };
const clampDue = (d: string) => (d < todayKey() ? todayKey() : d);

// ── Detay ──────────────────────────────────────────────
function useReminders(oppId: string, dateIds: string[]) {
  return useQuery({
    queryKey: ['reminders', oppId, dateIds.join(',')], enabled: dateIds.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from('reminders').select('*').in('opportunity_date_id', dateIds).order('remind_at'); if (error) throw error; return data as { id: string; remind_at: string; label: string; sent_at: string | null }[]; },
  });
}

function OpportunityDetail({ id }: { id: string }) {
  const opps = useOpportunities();
  const dates = useOppDates();
  const tasks = useTasks();
  const projects = useProjects();
  const links = useProjectOpps();
  const files = useFiles();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { openTask } = useEditors();
  const mut = useRowMutation('opportunities', ['opps']);
  const dateMut = useRowMutation('opportunity_dates', ['opps', 'cal', 'year', 'reminders']);
  const linkMut = useRowMutation('project_opportunities', ['opps']);
  const [showSrc, setShowSrc] = useState(false);
  const o = opps.data?.find((x) => x.id === id);
  const myDates = useMemo(() => (dates.data ?? []).filter((d) => d.opportunity_id === id).sort((a, b) => a.day.localeCompare(b.day)), [dates.data, id]);
  const rem = useReminders(id, myDates.map((d) => d.id));
  const srcFile = files.data?.find((f) => f.id === o?.source_file_id);
  const srcUrl = useSignedUrl(srcFile?.storage_path);
  if (opps.isLoading) return <p className="muted">Loading…</p>;
  if (!o) return <Empty title="Opportunity not found"><Link to="/opportunities">Back to list</Link></Empty>;
  const prep = (tasks.data ?? []).filter((t) => t.opportunity_id === o.id && t.status !== 'cancelled');
  const dl = myDates.find((d) => d.kind === 'deadline');
  const today = todayKey();
  const upd = (row: Partial<Opportunity>) => mut.mutate({ op: 'update', id: o.id, row: row as Record<string, unknown> }, { onError: (x) => toast.fail(x) });
  const myProjects = (links.data ?? []).filter((l) => l.opportunity_id === o.id);
  const docs = o.required_docs ?? [];
  const missing = docs.filter((d) => !d.done);

  async function attachDoc(input: File[] | FileRec[], idx: number) {
    if (!input[0]) return;
    try {
      const first = input[0]; const rec = first instanceof File ? (await uploadFile(first)).rec : first;
      if (myProjects[0]) await linkFile(rec.id, 'project', myProjects[0].project_id);
      upd({ required_docs: docs.map((d, i) => (i === idx ? { ...d, done: true, file_id: rec.id } : d)) });
      qc.invalidateQueries({ queryKey: ['files'] }); toast.ok('Document added');
    } catch (x) { toast.fail(x); } }
  async function planPrep() {
    const base = dl?.day;
    const existing = new Set(prep.map((t) => t.title.toLocaleLowerCase('en')));
    const plan: [string, number][] = [
      ...missing.map((d): [string, number] => [`Prepare ${d.label}`, 10]),
      ['Fill in the application form', 3], ...(o!.fee_amount ? [['Pay the application fee', 2] as [string, number]] : []), ['Submit the application and save the confirmation', 1],
      ...(myDates.some((d) => d.kind === 'delivery') ? [['Plan the artwork delivery', 14] as [string, number]] : []),
      ...(myDates.some((d) => d.kind === 'opening') ? [['Prepare the exhibition promotion', 7] as [string, number]] : []),
    ];
    const rows = plan.filter(([t]) => !existing.has(t.toLocaleLowerCase('en'))).map(([title, before]) => ({
      title, opportunity_id: o!.id, project_id: myProjects[0]?.project_id ?? null, category: 'Application', priority: 'high', source: 'template',
      due_date: base ? clampDue(addDays(title.includes('delivery') && myDates.find((d) => d.kind === 'delivery') ? myDates.find((d) => d.kind === 'delivery')!.day : title.includes('promotion') ? myDates.find((d) => d.kind === 'opening')!.day : base, -before)) : null,
    }));
    if (!rows.length) return toast.ok('Preparation plan is already up to date');
    const { error } = await supabase.from('tasks').insert(rows);
    if (error) return toast.fail(error);
    ['tasks', 'cal', 'year'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast.ok(`${rows.length} preparation tasks added${base ? '· planned backwards from the deadline' : ''}`);
    if (o!.status === 'to_review' || o!.status === 'potential') upd({ status: 'preparing' });
  }

  return (
    <>
      <PageHead title={o.title}>
        <Link className="btn btn-glass btn-sm" to="/opportunities"><ArrowLeft size={14} />All opportunities</Link>
 <select id="od-status" className="select" style={{ width: 'auto', borderColor: OPP_STATUS_COLOR[o.status], fontWeight: 600 }} value={o.status} onChange={(e) => upd({ status: e.target.value as OppStatus })}>
          {PIPE.map((s) => <option key={s} value={s}>{OPP_STATUS_LABEL[s]}</option>)}
        </select>
      </PageHead>
      <TagPicker type="opportunity" id={o.id} />
      {o.extraction && Array.isArray((o.extraction as { warnings?: string[] }).warnings) && (o.extraction as { warnings: string[] }).warnings.length > 0 && (
        <div className="warn-box"><b className="row" style={{ gap: 6 }}><AlertTriangle size={15} />The announcement has unclear information</b><ul>{(o.extraction as { warnings: string[] }).warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
      )}
      {dl && dl.day >= today && missing.length > 0 && (
        <div className="card row" style={{ borderColor: 'var(--orange-500)', gap: 10 }}>
          <AlertTriangle size={18} color="var(--orange-600)" />
          <span style={{ flex: 1 }}>Application deadline <b>{formatLong(dl.day)}</b> ({daysBetween(today, dl.day)} days). Documents not ready yet: <b>{missing.map((d) => d.label).join(', ')}</b>.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={planPrep}><Wand2 size={13} />Create preparation plan</button>
        </div>
      )}
      <div className="day-grid">
        <div style={{ display: 'grid', gap: 'var(--s5)' }}>
          <section className="glass panel">
            <h2 style={{ marginBottom: 12 }}>Key dates</h2>
            <div style={{ display: 'grid', gap: 6 }}>
              {myDates.map((d) => (
                <div key={d.id} className="date-row" style={{ borderStyle: d.certainty === 'confirmed' ? 'solid' : 'dashed', borderColor: d.certainty === 'confirmed' ? undefined : 'var(--orange-500)' }}>
                  <b>{OPP_DATE_LABEL[d.kind]}</b>
                  <input id={`od-d-${d.id}`} type="date" className="input" value={d.day} onChange={(e) => e.target.value && dateMut.mutate({ op: 'update', id: d.id, row: { day: e.target.value, certainty: 'confirmed' } }, { onError: (x) => toast.fail(x) })} />
                  <span className="small" style={{ color: d.day < today ? 'var(--ink-500)' : 'var(--ink-700)' }}>{formatRelative(d.day)}{d.time_text ? ` · ${d.time_text}` : ''}{d.certainty !== 'confirmed' && <b style={{ color: 'var(--orange-600)' }}> · {d.certainty === 'uncertain' ? 'unclear' : 'conflicting'}</b>}</span>
                  <ConfirmButton label="Delete" className="btn btn-ghost btn-sm" confirmText="Delete this date?" onConfirm={() => dateMut.mutate({ op: 'hard_delete', id: d.id })} />
                  {d.evidence && <q className="small muted" style={{ gridColumn: '1 / -1' }}>{d.evidence}</q>}
                </div>
              ))}
              <AddDate oppId={o.id} existing={myDates} />
            </div>
            <p className="small muted">Dates appear in the main calendar. When you change them, reminders are rebuilt automatically.</p>
          </section>

          <section className="glass panel">
            <div className="panel-head"><h2>Preparation tasks</h2><div className="row"><button type="button" className="btn btn-glass btn-sm" onClick={planPrep}><Wand2 size={13} />Suggest plan</button><button type="button" className="btn btn-primary btn-sm" onClick={() => openTask({ opportunity_id: o.id, project_id: myProjects[0]?.project_id ?? null, category: 'Application' })}><Plus size={13} />Task</button></div></div>
            {prep.length === 0 ? <p className="small muted">No tasks yet.</p> : <div className="task-list">{prep.sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).map((t) => <TaskRow key={t.id} task={t} />)}</div>}
            {prep.length > 0 && <p className="small muted">{prep.filter((t) => t.status === 'done').length}/{prep.length} completed · tasks also appear in your calendar and the linked project.</p>}
          </section>

          <section className="glass panel">
            <div className="panel-head"><h2>Required documents</h2><span className="small muted">{docs.filter((d) => d.done).length}/{docs.length} ready</span></div>
            {docs.map((d, i) => (
              <div key={i} className="task-row" style={{ cursor: 'default', alignItems: 'center' }}>
                <button type="button" className={`check${d.done ? ' on' : ''}`} onClick={() => upd({ required_docs: docs.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} aria-label="Ready">{d.done && <CheckCircle2 size={14} />}</button>
                <div className="t"><b style={{ textDecoration: d.done ? 'line-through' : undefined }}>{d.label}</b>{d.file_id && <span className="small muted"> · {files.data?.find((f) => f.id === d.file_id)?.title}</span>}
                  {d.kit_id && <KitDocChip id={d.kit_id} onUnlink={() => upd({ required_docs: docs.map((x, j) => (j === i ? { ...x, kit_id: null } : x)) })} />}</div>
                <MediaSources id={`od-doc-${i}`} size="xs" multiple={false} onFiles={(f) => attachDoc(f, i)} onPicked={(f) => attachDoc(f, i)} />
                <KitLinkButton label={d.label} onPick={(kid) => upd({ required_docs: docs.map((x, j) => (j === i ? { ...x, kit_id: kid, done: true } : x)) })} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => upd({ required_docs: docs.filter((_, j) => j !== i) })}><Trash2 size={13} />Remove</button>
              </div>
            ))}
            <form className="row" style={{ marginTop: 8 }} onSubmit={(e: FormEvent) => { e.preventDefault(); const inp = ((e.currentTarget as HTMLFormElement).elements.namedItem('nd') as HTMLInputElement); if (!inp.value.trim()) return; upd({ required_docs: [...docs, { label: inp.value.trim(), done: false } as RequiredDoc] }); inp.value = ''; }}>
              <input id="od-newdoc" name="nd" className="input" style={{ flex: 1, width: 'auto' }} placeholder="Add document (e.g. Artist statement)" /><button className="btn btn-glass btn-sm"><Plus size={13} />Add</button>
            </form>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 'var(--s5)', alignContent: 'start' }}>
          <DetailsForm o={o} onSave={upd} />
          <section className="glass panel">
            <h3 className="row" style={{ gap: 6, marginBottom: 8 }}><Link2 size={16} />Linked projects</h3>
            <div className="row">
              {myProjects.map((l) => { const p = projects.data?.find((x) => x.id === l.project_id); return p && <span key={l.id} className="chip"><Link to={`/projects/${p.slug}/opportunities`} style={{ color: 'inherit' }}>{p.icon ?? '✦'} {p.title}</Link><button type="button" onClick={() => linkMut.mutate({ op: 'hard_delete', id: l.id })} aria-label="Remove link" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>×</button></span>; })}
              <select id="od-proj" className="select" style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }} value="" onChange={(e) => e.target.value && linkMut.mutate({ op: 'insert', row: { project_id: e.target.value, opportunity_id: o.id } }, { onError: (x) => toast.fail(x) })}>
                <option value="">Link to project…</option>{projects.data?.filter((p) => !myProjects.some((l) => l.project_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </section>
          <section className="glass panel">
            <h3 className="row" style={{ gap: 6, marginBottom: 8 }}><Bell size={16} />Reminders</h3>
            {(rem.data ?? []).filter((r) => !r.sent_at).length === 0 ? <p className="small muted">No pending reminders.</p> : (
              <div style={{ display: 'grid', gap: 4 }}>{rem.data!.filter((r) => !r.sent_at).map((r) => <span key={r.id} className="small">{formatShort(r.remind_at.slice(0, 10))} 09:00 · {r.label}</span>)}</div>
            )}
            <p className="small muted">30, 14, 7 and 3 days before the deadline and on the day itself; 1 day before and on the day for other dates. <Link to="/settings">Settings</Link>. Notifications are sent in Phase 4.</p>
          </section>
          <section className="glass panel">
            <h3 className="row" style={{ gap: 6, marginBottom: 8 }}><FileText size={16} />Source</h3>
            {o.source_url && <a className="small" href={o.source_url} target="_blank" rel="noopener noreferrer">{o.source_url.slice(0, 60)} <ExternalLink size={11} /></a>}
            {srcFile && srcUrl.data && <a className="small" href={srcUrl.data} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>📎 {srcFile.title}</a>}
            {o.source_text && <><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSrc(!showSrc)}>{showSrc ? 'Hide text' : 'Show original text'}</button>{showSrc && <pre className="src-text">{o.source_text}</pre>}</>}
            {!o.source_url && !srcFile && !o.source_text && <p className="small muted">Entered manually.</p>}
          </section>
          <ConfirmButton label="Delete opportunity" className="btn btn-ghost btn-sm" confirmText="Move this opportunity to trash? Its tasks aren’t deleted."
            onConfirm={() => mut.mutate({ op: 'delete', id: o.id }, { onSuccess: () => nav('/opportunities') })} />
        </div>
      </div>
    </>
  );
}

function AddDate({ oppId, existing }: { oppId: string; existing: OppDate[] }) {
  const mut = useRowMutation('opportunity_dates', ['opps', 'cal', 'year', 'reminders']);
  const toast = useToast();
  const free = DATE_KINDS.filter((k) => !existing.some((d) => d.kind === k));
  const [kind, setKind] = useState<OppDateKind>(free[0] ?? 'deadline');
  const [day, setDay] = useState('');
  if (!free.length) return null;
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (!day) return; mut.mutate({ op: 'insert', row: { opportunity_id: oppId, kind, day } }, { onSuccess: () => setDay(''), onError: (x) => toast.fail(x) }); }}>
      <select id="ad-kind" className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as OppDateKind)}>{free.map((k) => <option key={k} value={k}>{OPP_DATE_LABEL[k]}</option>)}</select>
      <input id="ad-day" type="date" className="input" style={{ width: 'auto' }} value={day} onChange={(e) => setDay(e.target.value)} />
      <button className="btn btn-glass btn-sm" disabled={!day}><Plus size={13} />Add</button>
    </form>
  );
}

function DetailsForm({ o, onSave }: { o: Opportunity; onSave: (r: Partial<Opportunity>) => void }) {
  const [f, setF] = useState({ organization: o.organization ?? '', gallery: o.gallery ?? '', city: o.city ?? '', country: o.country ?? '', fee: o.fee_amount != null ? String(o.fee_amount) : '', cur: o.fee_currency ?? 'TRY', fee_note: o.fee_note ?? '',
    application_url: o.application_url ?? '', requirements: o.requirements ?? '', artwork_requirements: o.artwork_requirements ?? '', cname: o.contact?.name ?? '', cemail: o.contact?.email ?? '', notes: o.notes ?? '', kind: o.kind });
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = () => onSave({ organization: f.organization || null, gallery: f.gallery || null, city: f.city || null, country: f.country || null, kind: f.kind as OppKind,
    fee_amount: f.fee === '' ? null : Number(f.fee.replace(',', '.')), fee_currency: f.fee === '' ? null : f.cur, fee_note: f.fee_note || null, application_url: f.application_url || null,
    requirements: f.requirements || null, artwork_requirements: f.artwork_requirements || null, contact: { name: f.cname || undefined, email: f.cemail || undefined }, notes: f.notes || null });
  return (
    <section className="glass panel" style={{ display: 'grid', gap: 10 }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) save(); }}>
      <h3>Details</h3>
      <div className="grid-2">
        <Field label="Type"><select id="df-kind" className="select" value={f.kind} onChange={s('kind')}>{Object.entries(OPP_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Organization"><input id="df-org" className="input" value={f.organization} onChange={s('organization')} /></Field>
        <Field label="Gallery"><input id="df-gal" className="input" value={f.gallery} onChange={s('gallery')} /></Field>
        <Field label="City / country"><div className="row" style={{ flexWrap: 'nowrap' }}><input id="df-city" className="input" value={f.city} onChange={s('city')} /><input id="df-country" className="input" value={f.country} onChange={s('country')} /></div></Field>
        <Field label="Fee"><div className="row" style={{ flexWrap: 'nowrap' }}><input id="df-fee" className="input" inputMode="decimal" value={f.fee} onChange={s('fee')} /><select id="df-cur" className="select" style={{ width: 90 }} value={f.cur} onChange={s('cur')}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></div></Field>
        <Field label="Fee note"><input id="df-fn" className="input" value={f.fee_note} onChange={s('fee_note')} /></Field>
      </div>
      {o.fee_amount != null && <span className="small muted">{fmtMoney(o.fee_amount, o.fee_currency)}</span>}
      <Field label="Application URL"><div className="row" style={{ flexWrap: 'nowrap' }}><input id="df-url" className="input" value={f.application_url} onChange={s('application_url')} />{o.application_url && <a className="btn btn-glass icon-btn" href={o.application_url} target="_blank" rel="noopener noreferrer" aria-label="Open"><ExternalLink size={14} /></a>}</div></Field>
      <Field label="Participation requirements"><textarea id="df-req" className="textarea" value={f.requirements} onChange={s('requirements')} /></Field>
      <Field label="Artwork requirements"><textarea id="df-art" className="textarea" value={f.artwork_requirements} onChange={s('artwork_requirements')} /></Field>
      <div className="grid-2">
        <Field label="Contact person"><input id="df-cn" className="input" value={f.cname} onChange={s('cname')} /></Field>
        <Field label="Email"><input id="df-ce" className="input" value={f.cemail} onChange={s('cemail')} /></Field>
      </div>
      <Field label="Personal notes"><textarea id="df-notes" className="textarea" value={f.notes} onChange={s('notes')} /></Field>
      <span className="small muted">Saved automatically when you leave the field.</span>
    </section>
  );
}

// ── Başvuru kiti bağlantısı ─────────────────────────────
function KitLinkButton({ label, onPick }: { label: string; onPick: (id: string) => void }) {
  const kit = useKit();
  const [open, setOpen] = useState(false);
  const l = label.toLocaleLowerCase('en');
  const guess: KitItem['kind'] | null = /cv|resume|özgeçmiş/.test(l) ? 'cv' : /statement|beyan/.test(l) ? 'statement' : /bio/.test(l) ? 'bio' : null;
  const items = (kit.data ?? []).filter((k) => k.body.trim()).sort((a, b) => Number(b.kind === guess) - Number(a.kind === guess));
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Link a text from the Application Kit"><BriefcaseBusiness size={13} />Kit</button>
      {open && (
        <Dialog title={`Link from Application Kit · ${label}`} onClose={() => setOpen(false)}>
          {items.length === 0 ? <p className="small muted">The kit is empty. <Link to="/kit">Write your bio, CV and statement</Link> first.</p> : (
            <div className="task-list">{items.map((k) => (
              <button type="button" key={k.id} className="task-row" style={{ textAlign: 'left', border: '1px solid var(--glass-edge)' }} onClick={() => { onPick(k.id); setOpen(false); }}>
                <div className="t"><b>{kitName(k)}{k.kind === guess ? ' ✦' : ''}</b><div className="meta">{k.body.slice(0, 90)}…</div></div>
              </button>
            ))}</div>
          )}
        </Dialog>
      )}
    </>
  );
}
function KitDocChip({ id, onUnlink }: { id: string; onUnlink: () => void }) {
  const kit = useKit();
  const toast = useToast();
  const k = kit.data?.find((x) => x.id === id);
  if (!k) return null;
  return (
    <span className="kit-chip">
      <BriefcaseBusiness size={12} />{kitName(k)}
      <button type="button" onClick={() => copyText(k.body).then(() => toast.ok('Copied ✦'), (x) => toast.fail(x))} aria-label="Copy text" title="Copy"><Copy size={12} /></button>
      <Link to={`/print/kit/${k.id}`} aria-label="PDF" title="PDF"><FileDown size={12} /></Link>
      <button type="button" onClick={onUnlink} aria-label="Unlink" title="Unlink"><X size={12} /></button>
    </span>
  );
}
