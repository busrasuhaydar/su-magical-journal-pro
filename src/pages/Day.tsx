import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPE } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Link2, FileText, Music, Film, StickyNote, Trash2, Maximize2, Upload, ExternalLink, CalendarCheck } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { useEditors } from '../components/Editors';
import { TimeGrid, movedTimes } from '../components/TimeGrid';
import { TaskRow } from '../components/TaskRow';
import { ConfirmButton, Field, formatBytes, useToast } from '../components/ui';
import { MediaSources } from '../components/Media';
import { gridItems, useGridHandlers } from './Calendar';
import { ensureJournalDay, ensureJournalPage, linkFile, pageHref, uploadFile, useAllPages, useCalendarRange, useFiles, useHolidays, useJournal, useJournalPage, useOverdue, useProjects, useSignedUrl, useSoftDelete } from '../lib/data';
import { BlockEditor } from '../components/editor/BlockEditor';
import { addDays, formatLong, isValidKey, todayKey, type DayKey } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { countryName, flag } from '../lib/countries';
import { PLATFORM_LABEL, POST_STATUS_LABEL, type BlockKind, type FileRec, type JournalBlock } from '../lib/types';
import { hhmm, minutesOf } from '../lib/dates';

export default function DayPage() {
  const { date } = useParams();
  if (!isValidKey(date)) return <Navigate to={`/day/${todayKey()}`} replace />;
  return <DayInner day={date} key={date} />;
}

function DayInner({ day }: { day: DayKey }) {
  const nav = useNavigate();
  const { openTask, openEvent, openPost } = useEditors();
  const data = useCalendarRange(day, day);
  const hol = useHolidays(day, day);
  const overdue = useOverdue();
  const onMove = useGridHandlers();
  const isToday = day === todayKey();
  const hs = hol.byDay.get(day) ?? [];
  const unscheduled = (data.data?.tasks ?? []).filter((t) => !t.starts_at && t.status !== 'cancelled');
  const allDayEvents = (data.data?.events ?? []).filter((e) => e.all_day);

  return (
    <>
      <PageHead title={<>{formatLong(day)}{isToday && <span className="script" style={{ fontSize: 26, marginLeft: 12 }}>today</span>}</>}>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-glass icon-btn" onClick={() => nav(`/day/${addDays(day, -1)}`)} aria-label="Previous day"><ChevronLeft size={18} /></button>
          {!isToday && <Link className="btn btn-glass btn-sm" to={`/day/${todayKey()}`}><CalendarCheck size={14} />Today</Link>}
          <button type="button" className="btn btn-glass icon-btn" onClick={() => nav(`/day/${addDays(day, 1)}`)} aria-label="Next day"><ChevronRight size={18} /></button>
        </div>
        <button type="button" className="btn btn-glass" onClick={() => openEvent({ starts_at: movedTimes(day, 600, 660).starts_at, ends_at: movedTimes(day, 600, 660).ends_at })}><Plus size={15} />Event</button>
        <button type="button" className="btn btn-primary" onClick={() => openTask({ due_date: day })}><Plus size={15} />Task</button>
      </PageHead>

      {hs.length > 0 && (
        <div className="hol-banner">
          {hs.filter((h) => h.country === 'TR').map((h) => (
            <span key={h.id} className="chip" style={{ background: 'var(--blush-100)', color: 'var(--rose-700)' }} title={h.note ?? ''}>
              🇹🇷 {h.local_name}{h.kind === 'half_day' ? ' (half day)' : h.kind === 'observance' ? ' (special day)' : ''}{h.certainty !== 'confirmed' ? ' · unconfirmed' : ''}
            </span>
          ))}
          {hs.filter((h) => h.country !== 'TR').length > 0 && (
            <details className="chip" style={{ cursor: 'pointer' }}>
              <summary>{hs.filter((h) => h.country !== 'TR').length} countries with official holidays</summary>
              <div style={{ display: 'grid', gap: 2, marginTop: 6, fontWeight: 400 }}>
                {hs.filter((h) => h.country !== 'TR').map((h) => <span key={h.id}>{flag(h.country)} {countryName(h.country)}: {h.local_name}</span>)}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="day-grid">
        <section className="glass panel">
          <div className="panel-head"><h2>Hourly plan</h2><span className="small muted">08:00 – 23:00</span></div>
          {allDayEvents.length > 0 && <div className="row" style={{ marginBottom: 10 }}>{allDayEvents.map((e) => <button type="button" key={e.id} className="pill event" style={{ fontSize: 13, padding: '4px 10px', cursor: 'pointer', border: 0 }} onClick={() => openEvent(e)}>{e.title}</button>)}</div>}
          <TimeGrid days={[day]} items={gridItems(data.data)} onMove={onMove}
            onOpen={(it) => (it.kind === 'task' ? openTask(it.rec) : openEvent(it.rec))}
            onCreate={(d, s) => { const t = movedTimes(d, s, s + 60); openTask({ due_date: d, ...t }); }} />
        </section>

        <div style={{ display: 'grid', gap: 'var(--s5)' }}>
          {isToday && (overdue.data?.length ?? 0) > 0 && (
            <section className="glass panel">
              <div className="panel-head"><h2>Pending tasks</h2><span className="count">{overdue.data!.length}</span></div>
              <p className="small muted" style={{ marginTop: -6 }}>Unfinished tasks don’t disappear. Move them to today, postpone or cancel them.</p>
              <div className="task-list">{overdue.data!.map((t) => <TaskRow key={t.id} task={t} overdue />)}</div>
            </section>
          )}
          <section className="glass panel">
            <div className="panel-head"><h2>Untimed tasks</h2><span className="count">{unscheduled.length}</span></div>
            {unscheduled.length === 0 ? <p className="small muted">No untimed tasks for this day.</p> :
              <div className="task-list">{unscheduled.map((t) => <TaskRow key={t.id} task={t} />)}</div>}
          </section>
          <section className="glass panel">
            <div className="panel-head"><h2>Social media posts</h2><button type="button" className="btn btn-glass btn-sm" onClick={() => openPost({ scheduled_at: movedTimes(day, 19 * 60, 19 * 60).starts_at })}><Plus size={13} />Content</button></div>
            {(data.data?.posts ?? []).length === 0 ? <p className="small muted">No posts scheduled for this day.</p> : (
              <div className="task-list">{data.data!.posts.map((p) => (
                <div key={p.id} className="task-row" onClick={() => openPost(p)} role="button" tabIndex={0}>
                  <div className="t"><b>{p.title}</b><div className="meta"><span className="mono">{hhmm(minutesOf(p.scheduled_at!))}</span><span>{POST_STATUS_LABEL[p.status]}</span>{p.post_targets?.map((t) => <span key={t.id}>{PLATFORM_LABEL[t.platform]}</span>)}</div></div>
                </div>
              ))}</div>
            )}
          </section>
          <JournalPanel day={day} />
        </div>
      </div>
    </>
  );
}

// ── Journal ─────────────────────────────────────────────
function kindOf(mime: string): BlockKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'document';
}

function JournalPanel({ day }: { day: DayKey }) {
  const qc = useQueryClient();
  const toast = useToast();
  const j = useJournal(day);
  const files = useFiles();
  const delBlock = useSoftDelete('journal_blocks');
  const [goal, setGoal] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setGoal(j.data?.day?.goal ?? ''); }, [j.data?.day?.goal]);
  const blocks = j.data?.blocks ?? [];
  const images = blocks.filter((b) => b.kind === 'image' || b.kind === 'video');
  const others = blocks.filter((b) => b.kind !== 'image' && b.kind !== 'video');
  const fileMap = new Map((files.data ?? []).map((f) => [f.id, f]));
  const refresh = () => qc.invalidateQueries({ queryKey: ['journal'] });

  async function addBlock(b: Partial<JournalBlock>) {
    const jd = await ensureJournalDay(day);
    const { error } = await supabase.from('journal_blocks').insert({ day_id: jd.id, position: (blocks.at(-1)?.position ?? 0) + 1, ...b });
    if (error) throw error;
    refresh();
  }
  async function saveGoal() {
    if ((j.data?.day?.goal ?? '') === goal) return;
    try { const jd = await ensureJournalDay(day); const { error } = await supabase.from('journal_days').update({ goal: goal || null }).eq('id', jd.id); if (error) throw error; refresh(); toast.ok('Daily goal saved'); } catch (x) { toast.fail(x); }
  }
  async function onFiles(list: FileList | File[] | FileRec[] | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const jd = await ensureJournalDay(day);
      let reusedCount = 0;
      let pos = (blocks.at(-1)?.position ?? 0) + 1;
      for (const f of Array.from(list as ArrayLike<File | FileRec>)) {
        let rec: FileRec;
        if (f instanceof File) {
          if (f.size > 1024 ** 3) { toast.fail(new Error(`${f.name} exceeds the 1 GB limit`)); continue; }
          const r = await uploadFile(f);
          if (r.reused) reusedCount++;
          rec = r.rec;
        } else rec = f;
        await linkFile(rec.id, 'journal_day', jd.id);
        await addBlock({ kind: kindOf(rec.mime), title: rec.title, file_id: rec.id, size: 'm', position: pos++ });
      }
      qc.invalidateQueries({ queryKey: ['files'] });
      toast.ok(reusedCount ? `Added (${reusedCount} files already existed and weren’t re-uploaded)` : 'Files added');
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  async function updateBlock(id: string, patch: Partial<JournalBlock>) {
    const { error } = await supabase.from('journal_blocks').update(patch).eq('id', id);
    if (error) toast.fail(error); else refresh();
  }
  async function reorder(fromId: string, toId: string) {
    const list = [...images];
    const from = list.findIndex((b) => b.id === fromId), to = list.findIndex((b) => b.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [m] = list.splice(from, 1); list.splice(to, 0, m);
    const positions = images.map((b) => b.position).sort((a, b) => a - b);
    await Promise.all(list.map((b, i) => b.position !== positions[i] ? supabase.from('journal_blocks').update({ position: positions[i] }).eq('id', b.id) : null));
    refresh();
  }

  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); };

  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Journal</h2></div>
      <Field label="Daily goal">
        <input id="goal" className="goal" value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={saveGoal} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="What do you want to achieve today?" />
      </Field>

      <JournalEditor day={day} />
      <div className="journal-blocks" style={{ marginTop: 16 }}>
        {images.length > 0 && <Gallery items={images} fileMap={fileMap} onResize={(b) => updateBlock(b.id, { size: b.size === 's' ? 'm' : b.size === 'm' ? 'l' : 's' })} onDelete={(b) => delBlock.mutate(b.id)} onReorder={reorder} />}
        {others.map((b) => <BlockCard key={b.id} b={b} file={b.file_id ? fileMap.get(b.file_id) : undefined} onDelete={() => delBlock.mutate(b.id)} />)}
      </div>

      <div className={`dropzone${over ? ' over' : ''}`} style={{ marginTop: 14 }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
        <Upload size={18} /> {busy ? 'Loading…' : 'Drop files here or'}{' '}
        <MediaSources id="j-files" busy={busy} accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,.md,.pages,.key,.xls,.xlsx" onFiles={onFiles} onPicked={onFiles} />
        <div className="small" style={{ marginTop: 4 }}>Photo, video, audio, PDF, document · the same file isn’t uploaded twice</div>
      </div>

    </section>
  );
}

/** Günlük yazısı: o güne ait sayfa, ortak blok editörüyle. Eski journal_blocks kayıtları aşağıda kart olarak kalır. */
function JournalEditor({ day }: { day: DayKey }) {
  const page = useJournalPage(day);
  const pages = useAllPages();
  const projects = useProjects();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [fresh, setFresh] = useState(false);
  async function start() {
    try { await ensureJournalPage(day, formatLong(day)); setFresh(true); qc.invalidateQueries({ queryKey: ['pages'] }); } catch (x) { toast.fail(x); }
  }
  const open = (id: string | null) => id && nav(pageHref(pages.data?.find((x) => x.id === id), projects.data));
  return (
    <div className="journal-editor">
      {page.data ? <BlockEditor key={page.data.id} pageId={page.data.id} projectId={null} pages={pages.data ?? []} onOpenPage={open} autoStart={fresh} />
        : !page.isLoading && <button type="button" className="block-empty" onClick={start}><StickyNote size={14} /> What’s on your mind today… click to start writing (type “/” for blocks)</button>}
    </div>
  );
}

function Thumb({ file }: { file?: FileRec }) {
  const u = useSignedUrl(file?.storage_path);
  if (!file || !u.data) return null;
  return file.mime.startsWith('video/') ? <video src={u.data} muted playsInline preload="metadata" /> : <img src={u.data} alt={file.title} loading="lazy" />;
}

function Gallery({ items, fileMap, onResize, onDelete, onReorder }: {
  items: JournalBlock[]; fileMap: Map<string, FileRec>; onResize: (b: JournalBlock) => void; onDelete: (b: JournalBlock) => void; onReorder: (from: string, to: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  function down(e: RPE, id: string) {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY }; setDragId(id);
  }
  function move(e: RPE) {
    if (!dragId || !start.current) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < 6) return;
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.gid);
    setOverId((el as HTMLElement | undefined)?.dataset.gid ?? null);
  }
  function up() {
    if (dragId && overId && overId !== dragId) onReorder(dragId, overId);
    setDragId(null); setOverId(null); start.current = null;
  }
  return (
    <div className="gallery" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {items.map((b) => (
        <div key={b.id} data-gid={b.id} className={`gal-item ${b.size}${overId === b.id && dragId !== b.id ? ' drop-target' : ''}`} style={{ opacity: dragId === b.id && overId ? 0.5 : 1 }} onPointerDown={(e) => down(e, b.id)}>
          <Thumb file={b.file_id ? fileMap.get(b.file_id) : undefined} />
          <div className="tools">
            <button type="button" onClick={() => onResize(b)} title="Resize" aria-label="Resize"><Maximize2 size={12} /> {b.size.toUpperCase()}</button>
            <button type="button" onClick={() => onDelete(b)} title="Remove" aria-label="Remove"><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BlockCard({ b, file, onDelete }: { b: JournalBlock; file?: FileRec; onDelete: () => void }) {
  const u = useSignedUrl(file?.storage_path);
  const Icon = b.kind === 'note' ? StickyNote : b.kind === 'link' ? Link2 : b.kind === 'audio' ? Music : b.kind === 'video' ? Film : FileText;
  return (
    <div className="card block-card">
      <span className="ico"><Icon size={18} /></span>
      <div className="bd">
        {b.kind === 'note' && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{b.body}</p>}
        {b.kind === 'link' && b.url && (
          <a className="link-card" href={b.url} target="_blank" rel="noopener noreferrer">
            <div><b>{b.title}</b><div className="small muted">{new URL(b.url).hostname}</div></div><ExternalLink size={14} style={{ marginLeft: 'auto' }} />
          </a>
        )}
        {file && b.kind !== 'note' && b.kind !== 'link' && (
          <>
            <b>{file.title}</b><div className="small muted">{formatBytes(file.size)}</div>
            {b.kind === 'audio' && u.data && <audio controls src={u.data} style={{ width: '100%', marginTop: 6 }} />}
            {b.kind !== 'audio' && u.data && <a className="small" href={u.data} target="_blank" rel="noopener noreferrer">Open</a>}
          </>
        )}
      </div>
      <ConfirmButton label={<Trash2 size={14} />} className="btn btn-ghost icon-btn" confirmText="Remove?" onConfirm={onDelete} />
    </div>
  );
}
