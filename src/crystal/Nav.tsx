// Gezinme: masaüstü sol sayfa, mobil kristal dok, "Journal" içindekiler sayfası ve "New" oluşturma sayfası.
// Dok sabitlemeleri ve son açılanlar cihazda tutulur (su:dock, su:recent). Dokta yukarı kaydırma içindekileri açar.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, CalendarDays, CalendarHeart, CalendarPlus, CheckSquare, Files, FolderHeart, Gem, Home, Images, Landmark, Lightbulb, ListPlus,
  LogOut, Megaphone, Pin, Plus, Search, Settings, Sparkles, Users, X, type LucideIcon, BellRing, NotebookPen, NotebookTabs, Inbox,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPref, setPref } from '../lib/prefs';
import { todayKey } from '../lib/dates';
import { useEditors } from '../components/Editors';
import { useToast } from '../components/ui';
import { QuickLinks } from '../components/QuickLinks';

export type NavItem = { to: string; match: string; label: string; short: string; Icon: LucideIcon; hint: string };
export const NAV: NavItem[] = [
  { to: '/', match: '/', label: 'Home', short: 'Today', Icon: Home, hint: 'Daily summary' },
  { to: '/calendar/month', match: '/calendar', label: 'Calendar', short: 'Calendar', Icon: CalendarDays, hint: 'Year · month · week · agenda' },
  { to: '/day', match: '/day', label: 'Daily Plan', short: 'Day', Icon: CalendarHeart, hint: 'Hour-by-hour plan, journal' },
  { to: '/tasks', match: '/tasks', label: 'Tasks', short: 'Tasks', Icon: CheckSquare, hint: 'All to-dos' },
  { to: '/projects', match: '/projects', label: 'My Projects', short: 'Projects', Icon: FolderHeart, hint: 'Exhibitions, collections' },
  { to: '/gallery', match: '/gallery', label: 'Gallery', short: 'Gallery', Icon: Images, hint: 'Shared gallery, NFT artworks' },
  { to: '/collections', match: '/collections', label: 'My Collections', short: 'Collection', Icon: Gem, hint: '530 artworks' },
  { to: '/inbox', match: '/inbox', label: 'Inbox', short: 'Inbox', Icon: Inbox, hint: 'Shared & quick notes' },
  { to: '/pages', match: '/pages', label: 'Pages', short: 'Pages', Icon: NotebookTabs, hint: 'Free pages, notes' },
  { to: '/ideas', match: '/ideas', label: 'Ideas & Notes', short: 'Notes', Icon: Lightbulb, hint: 'On My Mind' },
  { to: '/opportunities', match: '/opportunities', label: 'Exhibitions & Opportunities', short: 'Opportunities', Icon: Landmark, hint: 'Applications, dates' },
  { to: '/social', match: '/social', label: 'Social Media', short: 'Social', Icon: Megaphone, hint: 'Posting plan' },
  { to: '/contacts', match: '/contacts', label: 'Contacts', short: 'Contacts', Icon: Users, hint: 'Galleries, curators' },
  { to: '/files', match: '/files', label: 'Files', short: 'Files', Icon: Files, hint: 'Documents, images' },
  { to: '/settings', match: '/settings', label: 'Settings', short: 'Settings', Icon: Settings, hint: 'Preferences, notifications' },
];
export const isActive = (pathname: string, n: NavItem) => (n.match === '/' ? pathname === '/' : pathname === n.match || pathname.startsWith(n.match + '/'));
export const openSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

const DEFAULT_PINS = ['/', '/calendar', '/tasks'];
function readPins(): string[] { try { const v = JSON.parse(getPref('dock', '[]')); return Array.isArray(v) && v.length === 3 ? v : DEFAULT_PINS; } catch { return DEFAULT_PINS; } }
function readRecent(): string[] { try { const v = JSON.parse(getPref('recent', '[]')); return Array.isArray(v) ? v : []; } catch { return []; } }

/** Son açılan bölümleri kaydeder (içindekiler sayfasının en üstünde görünür). */
export function useRecent() {
  const loc = useLocation();
  useEffect(() => {
    const n = NAV.find((x) => isActive(loc.pathname, x));
    if (!n) return;
    const r = [n.match, ...readRecent().filter((m) => m !== n.match)].slice(0, 5);
    setPref('recent', JSON.stringify(r));
  }, [loc.pathname]);
}

/** Alttan açılan kristal sayfa (mobil) / ortada pencere (masaüstü). */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  // aşağı kaydırarak kapat
  const y0 = useRef<number | null>(null);
  return (
    <div className="cr-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cr-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}
        onTouchStart={(e) => { y0.current = (ref.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null; }}
        onTouchEnd={(e) => { if (y0.current != null && e.changedTouches[0].clientY - y0.current > 90) onClose(); y0.current = null; }}>
        <span className="cr-grab" aria-hidden="true" />
        <div className="cr-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-glass icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "New": görev, etkinlik, hatırlatma, paylaşım, fikir (hemen yazılır), günlük not. */
export function CreateSheet({ onClose }: { onClose: () => void }) {
  const { openTask, openEvent, openPost } = useEditors();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [idea, setIdea] = useState('');
  const today = todayKey();
  const run = (f: () => void) => { onClose(); setTimeout(f, 30); };
  async function saveIdea() {
    const v = idea.trim(); if (!v) return;
    const [first, ...rest] = v.split('\n');
    const { error } = await supabase.from('ideas').insert({ title: first.slice(0, 200), body: rest.join('\n').trim() || null, category: 'art' });
    if (error) return toast.fail(error);
    setIdea(''); qc.invalidateQueries({ queryKey: ['ideas'] }); toast.ok('Idea written in the journal ✦'); onClose();
  }
  const acts: [string, string, LucideIcon, () => void][] = [
    ['Task', 'To today', ListPlus, () => openTask({ due_date: today })],
    ['Event', 'Calendar', CalendarPlus, () => openEvent({})],
    ['Reminder', 'Recurring', BellRing, () => openTask({ due_date: today, rrule: 'FREQ=DAILY' })],
    ['Post', 'Social media', Megaphone, () => openPost({})],
    ['Journal note', 'Today’s page', NotebookPen, () => nav(`/day/${today}`)],
    ['Search', 'Everywhere', Search, openSearch],
  ];
  return (
    <Sheet title="Add to journal" onClose={onClose}>
      <div className="cr-acts">
        {acts.map(([l, h, I, f]) => (
          <button key={l} type="button" className="cr-act" onClick={() => run(f)}><span className="cr-gem"><I size={22} strokeWidth={1.7} /></span><b>{l}</b><small>{h}</small></button>
        ))}
      </div>
      <div className="cr-quick">
        <label htmlFor="cr-idea" className="cr-quick-l"><Sparkles size={15} /> Quick idea</label>
        <textarea id="cr-idea" className="textarea" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveIdea(); }} placeholder="Write what comes to mind… (the first line becomes the title)" />
        <button type="button" className="btn btn-primary btn-sm" onClick={saveIdea} disabled={!idea.trim()}><Plus size={14} />Save idea</button>
      </div>
    </Sheet>
  );
}

/** "Journal": tüm bölümler, arama, son açılanlar, doka sabitleme, çıkış. */
export function IndexSheet({ onClose, pins, setPins }: { onClose: () => void; pins: string[]; setPins: (p: string[]) => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const recent = readRecent().map((m) => NAV.find((n) => n.match === m)).filter(Boolean).filter((n) => !isActive(loc.pathname, n!)).slice(0, 4) as NavItem[];
  function togglePin(m: string) {
    if (pins.includes(m)) { if (pins.length > 1) setPins(pins.filter((x) => x !== m)); return; }
    setPins([...pins, m].slice(-3));
  }
  return (
    <Sheet title="Contents" onClose={onClose}>
      <button type="button" className="cr-search" onClick={() => { onClose(); setTimeout(openSearch, 30); }}><Search size={18} /><span>Search task, project, artwork, contact…</span><kbd className="kbd">⌘K</kbd></button>
      {recent.length > 0 && (
        <div className="cr-recent">
          <span className="cr-cap">Recently opened</span>
          <div className="cr-recent-row">{recent.map((n) => <Link key={n.match} to={n.to} onClick={onClose} className="chip"><n.Icon size={13} />{n.short}</Link>)}</div>
        </div>
      )}
      <QuickLinks onNavigate={onClose} compact />
      <div className="cr-index">
        {NAV.map((n) => {
          const on = isActive(loc.pathname, n);
          const pinned = pins.includes(n.match);
          return (
            <div key={n.match} className={`cr-ix${on ? ' on' : ''}`}>
              <Link to={n.to} onClick={onClose} className="cr-ix-main">
                <span className="cr-gem sm"><n.Icon size={19} strokeWidth={1.7} /></span>
                <span className="cr-ix-t"><b>{n.label}</b><small>{n.hint}</small></span>
              </Link>
              <button type="button" className={`cr-pin${pinned ? ' on' : ''}`} aria-pressed={pinned} aria-label={pinned ? `Unpin ${n.label} from the dock` : `Pin ${n.label} to the dock`} title={pinned ? 'Unpin from the dock' : 'Pin to bottom bar'} onClick={() => togglePin(n.match)}>
                <Pin size={15} fill={pinned ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="small muted cr-tip">Use the pin to attach your three most-used sections to the bottom bar. Swipe up on the bottom bar to open this page.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().then(() => nav('/'))}><LogOut size={14} />Sign out</button>
    </Sheet>
  );
}

/** Mobil kristal dok: 3 sabit bölüm + ortada "New" mücevheri + "Journal". */
export function Dock() {
  const loc = useLocation();
  const [pins, setPinsS] = useState(readPins);
  const [sheet, setSheet] = useState<'' | 'new' | 'index'>('');
  const setPins = (p: string[]) => { setPinsS(p); setPref('dock', JSON.stringify(p.length === 3 ? p : [...p, ...DEFAULT_PINS.filter((d) => !p.includes(d))].slice(0, 3))); };
  useEffect(() => { setSheet(''); }, [loc.pathname]);
  useEffect(() => {
    const open = (e: Event) => setSheet((e as CustomEvent<'new' | 'index'>).detail);
    document.addEventListener('cr-sheet', open);
    return () => document.removeEventListener('cr-sheet', open);
  }, []);
  const items = (pins.length === 3 ? pins : DEFAULT_PINS).map((m) => NAV.find((n) => n.match === m)!).filter(Boolean);
  const y0 = useRef<number | null>(null);
  const cell = (n: NavItem) => (
    <Link key={n.match} to={n.to} className={isActive(loc.pathname, n) ? 'active' : ''} aria-current={isActive(loc.pathname, n) ? 'page' : undefined}>
      <span className="ic"><n.Icon size={22} strokeWidth={1.75} /></span><span className="tx">{n.short}</span>
    </Link>
  );
  const inIndex = !items.some((n) => isActive(loc.pathname, n)) && NAV.some((n) => isActive(loc.pathname, n));
  return (
    <>
      <nav className="cr-dock" aria-label="Bottom menu"
        onTouchStart={(e) => { y0.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (y0.current != null && y0.current - e.changedTouches[0].clientY > 40) setSheet('index'); y0.current = null; }}>
        {cell(items[0])}{cell(items[1])}
        <button type="button" className="cr-new" onClick={() => setSheet('new')} aria-label="Add to journal"><span className="cr-new-gem"><Plus size={26} strokeWidth={2.2} /></span></button>
        {cell(items[2])}
        <button type="button" className={inIndex ? 'active' : ''} onClick={() => setSheet('index')} aria-label="Contents: all sections">
          <span className="ic"><BookOpen size={22} strokeWidth={1.75} /></span><span className="tx">Journal</span>
        </button>
      </nav>
      {sheet === 'new' && <CreateSheet onClose={() => setSheet('')} />}
      {sheet === 'index' && <IndexSheet onClose={() => setSheet('')} pins={pins} setPins={setPins} />}
    </>
  );
}
