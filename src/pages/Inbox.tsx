// Gelen kutusu: telefondan paylaşılan metin / bağlantı / görsel ve hızlı notlar. Tek dokunuşla günlüğe, sayfaya veya göreve taşınır.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarHeart, CheckSquare, FileText, Inbox as InboxIcon, Link2, Plus, Send, Trash2 } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { Dialog, Empty, useToast } from '../components/ui';
import { Thumb } from '../components/Media';
import { ensureJournalPage, linkFile, uploadFile, useAllPages, useFiles, useProjects } from '../lib/data';
import { formatLong, todayKey } from '../lib/dates';
import { supabase } from '../lib/supabase';

export interface InboxItem { id: string; kind: 'text' | 'link' | 'image' | 'file'; text: string | null; url: string | null; file_id: string | null; source: 'quick' | 'share'; created_at: string }

export function useInbox() {
  return useQuery({ queryKey: ['inbox'], queryFn: async () => {
    const { data, error } = await supabase.from('inbox_items').select('*').is('processed_at', null).is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    if (error) throw error; return data as InboxItem[];
  } });
}

/** Metni gelen kutusuna yazar (bağlantı ise link olarak). */
export async function captureText(raw: string) {
  const v = raw.trim(); if (!v) return;
  const url = /^https?:\/\/\S+$/i.test(v) ? v : null;
  const { error } = await supabase.from('inbox_items').insert({ kind: url ? 'link' : 'text', text: url ? null : v, url, source: 'quick' });
  if (error) throw error;
}

/** Service worker'ın sakladığı paylaşımları yükleyip gelen kutusuna yazar. */
async function importShared(): Promise<number> {
  if (!('caches' in window)) return 0;
  const cache = await caches.open('su-share');
  const keys = (await cache.keys()).map((r) => new URL(r.url).pathname).filter((p) => p.endsWith('/meta'));
  let n = 0;
  for (const k of keys) {
    const meta = await (await cache.match(k))!.json() as { id: string; title: string; text: string; url: string; files: number };
    const urlInText = /https?:\/\/\S+/.exec(meta.text)?.[0];
    const url = meta.url || urlInText || null;
    const text = [meta.title, meta.text.replace(urlInText ?? '\u0000', '').trim()].filter(Boolean).join('\n') || null;
    for (let i = 0; i < meta.files; i++) {
      const r = await cache.match(`/__share/${meta.id}/file-${i}`);
      if (!r) continue;
      const blob = await r.blob();
      const file = new File([blob], decodeURIComponent(r.headers.get('X-Name') ?? 'shared'), { type: blob.type });
      const { rec } = await uploadFile(file);
      const { error } = await supabase.from('inbox_items').insert({ kind: file.type.startsWith('image/') ? 'image' : 'file', file_id: rec.id, text: i === 0 ? text : null, url: i === 0 ? url : null, source: 'share' });
      if (error) throw error;
      await cache.delete(`/__share/${meta.id}/file-${i}`); n++;
    }
    if (!meta.files && (text || url)) {
      const { error } = await supabase.from('inbox_items').insert({ kind: url && !text ? 'link' : 'text', text, url, source: 'share' });
      if (error) throw error; n++;
    }
    await cache.delete(k);
  }
  return n;
}

export default function InboxPage() {
  const inbox = useInbox();
  const files = useFiles();
  const projects = useProjects();
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [pickFor, setPickFor] = useState<InboxItem | null>(null);
  const today = todayKey();

  useEffect(() => {
    importShared().then((n) => { if (n) { toast.ok(`${n} shared item${n > 1 ? 's' : ''} added to the inbox ✦`); qc.invalidateQueries({ queryKey: ['inbox'] }); qc.invalidateQueries({ queryKey: ['files'] }); } }).catch((x) => toast.fail(x));
  }, [qc, toast]);

  const done = async (it: InboxItem, moved_to: Record<string, unknown>) => {
    const { error } = await supabase.from('inbox_items').update({ processed_at: new Date().toISOString(), moved_to }).eq('id', it.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['inbox'] });
  };
  /** Öğeyi bir sayfanın sonuna blok olarak ekler. */
  async function appendTo(pageId: string, it: InboxItem) {
    const { data: last } = await supabase.from('page_blocks').select('position').eq('page_id', pageId).order('position', { ascending: false }).limit(1);
    let pos = (last?.[0]?.position ?? 0) + 1;
    const rows: Record<string, unknown>[] = [];
    if (it.file_id) rows.push({ page_id: pageId, type: it.kind === 'image' ? 'image' : 'file', file_id: it.file_id, content: {}, position: pos++ });
    if (it.text) rows.push({ page_id: pageId, type: 'text', content: { text: it.text }, position: pos++ });
    if (it.url) rows.push({ page_id: pageId, type: 'link', content: { url: it.url, title: (() => { try { return new URL(it.url!).hostname; } catch { return it.url; } })() }, position: pos++ });
    const { error } = await supabase.from('page_blocks').insert(rows);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['blocks', pageId] });
  }
  const toJournal = async (it: InboxItem) => {
    try { const pg = await ensureJournalPage(today, formatLong(today)); await appendTo(pg.id, it); await done(it, { type: 'journal', day: today }); qc.invalidateQueries({ queryKey: ['pages'] }); toast.ok('Added to today’s journal ✦'); } catch (x) { toast.fail(x); }
  };
  const toPage = async (it: InboxItem, pageId: string, title: string) => {
    try { await appendTo(pageId, it); await done(it, { type: 'page', id: pageId }); toast.ok(`Added to “${title}” ✦`); } catch (x) { toast.fail(x); }
  };
  const toTask = async (it: InboxItem) => {
    try {
      const [first, ...rest] = (it.text ?? it.url ?? 'Shared image').split('\n');
      const { data, error } = await supabase.from('tasks').insert({ title: first.slice(0, 200), description: [rest.join('\n').trim(), it.text ? it.url : null].filter(Boolean).join('\n') || null, due_date: today }).select().single();
      if (error) throw error;
      if (it.file_id) await linkFile(it.file_id, 'task', data.id);
      await done(it, { type: 'task', id: data.id });
      ['tasks', 'cal'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.ok('Task added for today ✦');
    } catch (x) { toast.fail(x); }
  };
  const remove = async (it: InboxItem) => { const { error } = await supabase.from('inbox_items').update({ deleted_at: new Date().toISOString() }).eq('id', it.id); if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['inbox'] }); };
  async function add() { try { await captureText(note); setNote(''); qc.invalidateQueries({ queryKey: ['inbox'] }); } catch (x) { toast.fail(x); } }

  const fileMap = new Map((files.data ?? []).map((f) => [f.id, f]));
  void projects;
  return (
    <>
      <PageHead title="Inbox" />
      <section className="glass panel">
        <div className="qn-row">
          <textarea id="inbox-note" className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} placeholder="Jot something down, sort it later… (a link works too)" />
          <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!note.trim()}><Plus size={14} />Add</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>On your phone, use <b>Share → Su's Journal</b> (after installing the app to the home screen) to send text, links and photos here.</p>
      </section>
      {inbox.isLoading && <p className="muted">Loading…</p>}
      {inbox.data?.length === 0 && <section className="glass panel"><Empty title="All sorted ✦">Nothing waiting in the inbox.</Empty></section>}
      <div className="inbox-list">
        {inbox.data?.map((it) => {
          const f = it.file_id ? fileMap.get(it.file_id) : undefined;
          return (
            <article key={it.id} className="glass panel inbox-item">
              {f && <div className="inbox-thumb"><Thumb file={f} /></div>}
              <div className="inbox-body">
                {it.text && <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{it.text}</p>}
                {it.url && <a className="small" href={it.url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}><Link2 size={12} /> {it.url}</a>}
                {f && !it.text && <span className="small muted">{f.title}</span>}
                <span className="small muted">{it.source === 'share' ? 'Shared' : 'Quick note'} · {new Date(it.created_at).toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="inbox-acts">
                <button type="button" className="btn btn-glass btn-sm" onClick={() => toJournal(it)}><CalendarHeart size={13} />Journal</button>
                <button type="button" className="btn btn-glass btn-sm" onClick={() => setPickFor(it)}><FileText size={13} />Page</button>
                <button type="button" className="btn btn-glass btn-sm" onClick={() => toTask(it)}><CheckSquare size={13} />Task</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(it)} aria-label="Delete"><Trash2 size={13} /></button>
              </div>
            </article>
          );
        })}
      </div>
      {pickFor && <PagePick onClose={() => setPickFor(null)} onPick={(id, title) => { const it = pickFor; setPickFor(null); toPage(it, id, title); }} />}
    </>
  );
}

function PagePick({ onPick, onClose }: { onPick: (id: string, title: string) => void; onClose: () => void }) {
  const pages = useAllPages();
  const projects = useProjects();
  const [q, setQ] = useState('');
  const list = (pages.data ?? []).filter((p) => !p.journal_day && p.title.toLocaleLowerCase('en').includes(q.toLocaleLowerCase('en'))).slice(0, 60);
  return (
    <Dialog title="Move to a page" onClose={onClose}>
      <input id="pp-q" className="input" placeholder="Search pages…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="task-list" style={{ marginTop: 10, maxHeight: 360, overflowY: 'auto' }}>
        {list.map((p) => <button type="button" key={p.id} className="task-row" style={{ textAlign: 'left', border: '1px solid var(--glass-edge)' }} onClick={() => onPick(p.id, p.title)}><div className="t"><b>{p.icon} {p.title}</b><div className="meta">{projects.data?.find((x) => x.id === p.project_id)?.title ?? 'Pages'}</div></div></button>)}
        {!list.length && <p className="small muted">No pages found. <Link to="/pages">Create one</Link>.</p>}
      </div>
    </Dialog>
  );
}

/** Ana sayfa: hızlı not kutusu (gelen kutusuna yazar). */
export function QuickNote() {
  const inbox = useInbox();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState('');
  async function save() { try { await captureText(v); setV(''); qc.invalidateQueries({ queryKey: ['inbox'] }); toast.ok('Saved to the inbox ✦'); } catch (x) { toast.fail(x); } }
  const n = inbox.data?.length ?? 0;
  return (
    <section className="glass panel qn">
      <label htmlFor="qn-text" className="qn-l"><InboxIcon size={15} /> Quick note</label>
      <div className="qn-row">
        <input id="qn-text" className="input" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Catch a thought, a link, a to-do…" />
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!v.trim()}><Send size={14} />Save</button>
        <Link to="/inbox" className="btn btn-glass btn-sm"><InboxIcon size={14} />Inbox{n ? ` · ${n}` : ''}</Link>
      </div>
    </section>
  );
}
