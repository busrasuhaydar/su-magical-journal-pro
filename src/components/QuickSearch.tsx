// Quick search (⌘K / Ctrl+K): projeler, sayfalar, görevler, içerikler, kişiler, fırsatlar, fikirler ve sayfalar arası geçiş.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { pageHref, useAllPages, useContacts, useIdeas, useOpportunities, usePosts, useProjects, useTasks } from '../lib/data';
import { dayKeyOf, formatRelative, todayKey } from '../lib/dates';
import { useEditors } from './Editors';
import { useNfts } from '../lib/nft';

type Item = { group: string; label: string; hint?: string; icon: string; run: () => void };
const norm = (s: string) => s.toLocaleLowerCase('en').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <button type="button" className="search-btn glass" onClick={() => setOpen(true)} aria-label="Search (⌘K)" title="Search (⌘K)"><Search size={18} /></button>
      {open && <Palette onClose={() => setOpen(false)} />}
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { openTask, openPost, openEvent } = useEditors();
  const projects = useProjects(), pages = useAllPages(), tasks = useTasks(), posts = usePosts(), contacts = useContacts(), opps = useOpportunities(), ideas = useIdeas();
  const nfts = useNfts();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const go = (to: string) => () => { nav(to); onClose(); };
  const act = (f: () => void) => () => { onClose(); f(); };

  const all: Item[] = useMemo(() => [
    { group: 'Quick actions', label: 'New task', icon: '＋', run: act(() => openTask({ due_date: todayKey() })) },
    { group: 'Quick actions', label: 'New content (social media)', icon: '✦', run: act(() => openPost({})) },
    { group: 'Quick actions', label: 'New event', icon: '◷', run: act(() => openEvent({})) },
    ...[['Home', '/'], ['Today', `/day/${todayKey()}`], ['Calendar', '/calendar/year'], ['Tasks', '/tasks'], ['My Projects', '/projects'], ['Social Media', '/social'],
      ['Exhibitions & Opportunities', '/opportunities'], ['Contacts', '/contacts'], ['Pages', '/pages'], ['Ideas', '/ideas'], ['Shared Gallery', '/gallery'], ['My Collections', '/collections'], ['Files', '/files'], ['Settings', '/settings']]
      .map(([l, to]) => ({ group: 'Go', label: l, icon: '→', run: go(to) })),
    ...(projects.data ?? []).map((p) => ({ group: 'Projects', label: p.title, icon: p.icon ?? '✦', run: go(`/projects/${p.slug}`) })),
    ...(pages.data ?? []).filter((pg) => !pg.journal_day).map((pg) => { const p = projects.data?.find((x) => x.id === pg.project_id); return { group: 'Pages', label: pg.title, hint: p?.title ?? 'Pages', icon: pg.icon ?? '📄', run: go(pageHref(pg, projects.data)) }; }),
    ...(tasks.data ?? []).filter((t) => t.status !== 'cancelled').map((t) => { const d = t.starts_at ? dayKeyOf(t.starts_at) : t.due_date; return { group: 'Tasks', label: t.title, hint: [t.status === 'done' ? 'Completed' : '', d ? formatRelative(d) : ''].filter(Boolean).join(' · '), icon: t.status === 'done' ? '✓' : '○', run: act(() => openTask(t)) }; }),
    ...(posts.data ?? []).map((p) => ({ group: 'Content', label: p.title, hint: p.scheduled_at ? formatRelative(dayKeyOf(p.scheduled_at)) : undefined, icon: '✦', run: act(() => openPost(p)) })),
    ...(opps.data ?? []).map((o) => ({ group: 'Opportunities', label: o.title, hint: o.organization ?? undefined, icon: '🏛', run: go(`/opportunities/${o.id}`) })),
    ...(contacts.data ?? []).map((c) => ({ group: 'Contacts', label: c.name, hint: c.organization ?? undefined, icon: '☺', run: go('/contacts') })),
    ...(nfts.data?.items ?? []).map((n) => ({ group: 'NFT artworks', label: n.name, hint: nfts.data!.collections.find((c) => c.slug === n.c)?.name, icon: '🖼️', run: go(`/collections/${n.c}?artwork=${n.contract.slice(0, 10).toLowerCase()}-${n.tokenId}`) })),
    ...(nfts.data?.collections ?? []).map((c) => ({ group: 'Collections', label: c.name, icon: '🖼️', run: go(`/collections/${c.slug}`) })),
    ...(ideas.data ?? []).map((i) => ({ group: 'Ideas', label: i.title, icon: '💡', run: go('/ideas') })),
  ], [projects.data, pages.data, tasks.data, posts.data, opps.data, contacts.data, ideas.data, nfts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return all.filter((i) => i.group === 'Quick actions' || i.group === 'Go' || i.group === 'Projects').slice(0, 30);
    return all.filter((i) => norm(`${i.label} ${i.hint ?? ''}`).includes(n)).sort((a, b) => Number(!norm(a.label).startsWith(n)) - Number(!norm(b.label).startsWith(n))).slice(0, 40);
  }, [q, all]);
  useEffect(() => setSel(0), [q]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') results[sel]?.run();
  };
  let last = '';
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-label="Quick search">
        <input ref={input} id="cmdk-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Search: project, task, content, contact, page…" autoComplete="off" />
        <div className="cmdk-list">
          {results.length === 0 && <p className="small muted" style={{ padding: 12 }}>No results.</p>}
          {results.map((r, i) => {
            const head = r.group !== last ? <div className="cmdk-group">{r.group}</div> : null; last = r.group;
            return <div key={i}>{head}<button type="button" className={`cmdk-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={r.run}><span>{r.icon}</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>{r.hint && <span className="k">{r.hint}</span>}</button></div>;
          })}
        </div>
      </div>
    </div>
  );
}
