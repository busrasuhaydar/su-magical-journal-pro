// Gezinme: masaüstü sol sayfa, mobil kristal dok, "Journal" içindekiler sayfası ve "New" oluşturma sayfası.
// Dok sabitlemeleri ve son açılanlar cihazda tutulur (su:dock, su:recent). Dokta yukarı kaydırma içindekileri açar.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, CalendarDays, CalendarHeart, CalendarPlus, CheckSquare, Files, FolderHeart, Gem, Home, Images, Landmark, Lightbulb, ListPlus,
  LogOut, Megaphone, Pin, Plus, Search, Settings, Sparkles, Users, X, type LucideIcon, BellRing, NotebookPen, NotebookTabs, Inbox, Frame, BriefcaseBusiness, Hash,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPref, setPref } from '../lib/prefs';
import { todayKey } from '../lib/dates';
import { useEditors } from '../components/Editors';
import { useToast } from '../components/ui';
import { QuickLinks } from '../components/QuickLinks';
import { ChevronDown, ChevronRight, FolderPlus, PinOff, Trash2 } from 'lucide-react';
import { useProfile } from '../lib/data';
import { useFavorites, usePrefsWriter, type NavRef } from '../lib/ui';
import { EditableItem, Sortable, useEditMode, useLayout, type LayoutItem } from '../lib/layout';

export type NavItem = { to: string; match: string; label: string; short: string; Icon: LucideIcon; hint: string };
export const NAV: NavItem[] = [
  { to: '/', match: '/', label: 'Home', short: 'Today', Icon: Home, hint: 'Daily summary' },
  { to: '/calendar/month', match: '/calendar', label: 'Calendar', short: 'Calendar', Icon: CalendarDays, hint: 'Year · month · week · agenda' },
  { to: '/day', match: '/day', label: 'Daily Plan', short: 'Day', Icon: CalendarHeart, hint: 'Hour-by-hour plan, journal' },
  { to: '/tasks', match: '/tasks', label: 'Tasks', short: 'Tasks', Icon: CheckSquare, hint: 'All to-dos' },
  { to: '/projects', match: '/projects', label: 'My Projects', short: 'Projects', Icon: FolderHeart, hint: 'Exhibitions, collections' },
  { to: '/gallery', match: '/gallery', label: 'Gallery', short: 'Gallery', Icon: Images, hint: 'Shared gallery, NFT artworks' },
  { to: '/artworks', match: '/artworks', label: 'Artworks', short: 'Artworks', Icon: Frame, hint: 'Inventory, certificates, price lists' },
  { to: '/collections', match: '/collections', label: 'My Collections', short: 'Collection', Icon: Gem, hint: '530 artworks' },
  { to: '/inbox', match: '/inbox', label: 'Inbox', short: 'Inbox', Icon: Inbox, hint: 'Shared & quick notes' },
  { to: '/pages', match: '/pages', label: 'Pages', short: 'Pages', Icon: NotebookTabs, hint: 'Free pages, notes' },
  { to: '/ideas', match: '/ideas', label: 'Ideas & Notes', short: 'Notes', Icon: Lightbulb, hint: 'On My Mind' },
  { to: '/opportunities', match: '/opportunities', label: 'Exhibitions & Opportunities', short: 'Opportunities', Icon: Landmark, hint: 'Applications, dates' },
  { to: '/kit', match: '/kit', label: 'Application Kit', short: 'Kit', Icon: BriefcaseBusiness, hint: 'Bio, CV, statement · TR/EN' },
  { to: '/social', match: '/social', label: 'Social Media', short: 'Social', Icon: Megaphone, hint: 'Posting plan' },
  { to: '/contacts', match: '/contacts', label: 'Contacts', short: 'Contacts', Icon: Users, hint: 'Galleries, curators' },
  { to: '/tags', match: '/tags', label: 'Tags', short: 'Tags', Icon: Hash, hint: 'Everything by #tag' },
  { to: '/files', match: '/files', label: 'Files', short: 'Files', Icon: Files, hint: 'Documents, images' },
  { to: '/settings', match: '/settings', label: 'Settings', short: 'Settings', Icon: Settings, hint: 'Preferences, notifications' },
];
export const isActive = (pathname: string, n: NavItem) => (n.match === '/' ? pathname === '/' : pathname === n.match || pathname.startsWith(n.match + '/'));
export const openSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

const DEFAULT_PINS = ['/', '/calendar', '/tasks'];
function readLocalPins(): string[] { try { const v = JSON.parse(getPref('dock', '[]')); return Array.isArray(v) && v.length >= 2 ? v : DEFAULT_PINS; } catch { return DEFAULT_PINS; } }
/** Mobil alt çubuk sabitlemeleri (2–4 bölüm; profiles.ui_prefs.dock, cihazlar arasında eşitlenir). */
function useDockPins(): [string[], (p: string[]) => void] {
  const ui = useProfile().data?.ui_prefs;
  const write = usePrefsWriter();
  const pins = (ui?.dock?.length ? ui.dock : readLocalPins()).filter((m) => NAV.some((n) => n.match === m)).slice(0, 4);
  return [pins.length >= 2 ? pins : DEFAULT_PINS, (p) => { setPref('dock', JSON.stringify(p)); write((u) => ({ ...u, dock: p })); }];
}

/** Menü düzeni: NAV + menüye sabitlenen favoriler + gruplar; sıra, gizle, ad, simge. */
export function useNavLayout() {
  const ui = useProfile().data?.ui_prefs ?? {};
  const write = usePrefsWriter();
  const pins = ui.nav_pins ?? [];
  const groups = ui.layout?.nav?.groups ?? [];
  const lay = useLayout('nav', [
    ...NAV.map((n) => ({ id: n.match, label: n.label, icon: n.Icon })),
    ...pins.map((p) => ({ id: `pin:${p.id}`, label: p.label, icon: Pin })),
    ...groups.map((g) => ({ id: g.id, label: g.label })),
  ], { register: false });
  const togglePin = (r: NavRef) => write((u) => { const l = u.nav_pins ?? []; return { ...u, nav_pins: l.some((x) => x.id === r.id) ? l.filter((x) => x.id !== r.id) : [...l, r] }; });
  const addGroup = () => lay.set((l) => ({ ...l, groups: [...(l.groups ?? []), { id: `g_${Date.now().toString(36)}`, label: 'New group' }] }));
  const delGroup = (id: string) => lay.set((l) => ({ ...l, groups: (l.groups ?? []).filter((g) => g.id !== id), order: (l.order ?? []).filter((x) => x !== id) }));
  const collapse = (id: string) => lay.set((l) => { const c = l.collapsed ?? []; return { ...l, collapsed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] }; });
  return { lay, pins, groups, togglePin, addGroup, delGroup, collapse };
}

/** Masaüstü sol menü (düzenleme modunda sürükle, gizle, yeniden adlandır, grup, sabitle). */
export function DesktopNav({ hideHome = true }: { hideHome?: boolean }) {
  const loc = useLocation();
  const { on } = useEditMode();
  const { lay, pins, groups, togglePin, addGroup, delGroup, collapse } = useNavLayout();
  const fav = useFavorites();
  const navBy = new Map(NAV.map((n) => [n.match, n]));
  const pinBy = new Map(pins.map((p) => [`pin:${p.id}`, p]));
  const gIds = new Set(groups.map((g) => g.id));
  const collapsed = new Set(lay.layout.collapsed ?? []);
  let cur: string | null = null;
  const rows = lay.items.filter((it) => !(hideHome && it.id === '/' && !lay.layout.order?.includes('/') && !on)).map((it) => { if (gIds.has(it.id)) { cur = it.id; return { it, g: null as string | null }; } return { it, g: cur }; });
  const body = (it: LayoutItem) => {
    const n = navBy.get(it.id), p = pinBy.get(it.id);
    const to = n?.to ?? p?.href ?? '/';
    const act = n ? isActive(loc.pathname, n) : loc.pathname === p?.href;
    return (
      <Link key={it.id} to={to} className={act ? 'active' : ''} aria-current={act ? 'page' : undefined} title={it.name} onClick={(e) => on && e.preventDefault()}>
        {p && !it.iconName ? <span className="nav-emoji" aria-hidden="true">{p.icon ?? '★'}</span> : it.Icon && <it.Icon size={18} strokeWidth={1.75} />}<span className="lbl">{it.name}</span>
      </Link>
    );
  };
  const head = (it: LayoutItem) => (
    <button key={it.id} type="button" className="nav-group-h" aria-expanded={!collapsed.has(it.id)} onClick={() => !on && collapse(it.id)}>
      {collapsed.has(it.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span className="lbl">{it.name}</span>
    </button>
  );
  if (!on) {
    return (
      <nav className="cr-nav" aria-label="Main menu">
        {rows.map(({ it, g }) => (it.hidden || (g && collapsed.has(g)) ? null : gIds.has(it.id) ? head(it) : body(it)))}
      </nav>
    );
  }
  const unpinned = fav.list.filter((f) => !pins.some((p) => p.id === f.id));
  return (
    <nav className="cr-nav ed-nav" aria-label="Main menu (editing)">
      <Sortable ids={rows.map((r) => r.it.id)} onMove={lay.move}>
        {rows.map(({ it }) => (
          <EditableItem key={it.id} item={it} lay={lay} className={gIds.has(it.id) ? 'nav-g' : 'nav-r'}
            extra={gIds.has(it.id) ? <button type="button" className="ed-btn" aria-label={`Delete group ${it.name}`} title="Delete group" onClick={() => delGroup(it.id)}><Trash2 size={14} /></button>
              : pinBy.has(it.id) ? <button type="button" className="ed-btn" aria-label={`Unpin ${it.name}`} title="Unpin from menu" onClick={() => togglePin(pinBy.get(it.id)!)}><PinOff size={14} /></button> : undefined}>
            {gIds.has(it.id) ? head(it) : body(it)}
          </EditableItem>
        ))}
      </Sortable>
      <button type="button" className="btn btn-glass btn-sm nav-add" onClick={addGroup}><FolderPlus size={14} /><span className="lbl">Add group</span></button>
      {unpinned.length > 0 && (
        <div className="nav-favs">
          <span className="cr-cap"><Pin size={11} /> Pin favorites to menu</span>
          {unpinned.map((f) => <button key={f.id} type="button" className="chip" onClick={() => togglePin(f)}><Pin size={12} />{f.icon ? `${f.icon} ` : ''}{f.label}</button>)}
        </div>
      )}
    </nav>
  );
}
/** NAV öğesinin kullanıcı adı/simgesi (dok ve içindekiler için). */
function useNavNames() {
  const { lay } = useNavLayout();
  const by = new Map(lay.items.map((i) => [i.id, i]));
  return { by, ordered: lay.items.filter((i) => !i.hidden && NAV.some((n) => n.match === i.id)).map((i) => NAV.find((n) => n.match === i.id)!) };
}
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
  const names = useNavNames();
  const nm = (n: NavItem) => names.by.get(n.match);
  function togglePin(m: string) {
    if (pins.includes(m)) { if (pins.length > 2) setPins(pins.filter((x) => x !== m)); return; }
    setPins([...pins, m].slice(-4));
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
        {names.ordered.map((n) => {
          const on = isActive(loc.pathname, n);
          const it = nm(n); const I = it?.Icon ?? n.Icon;
          const pinned = pins.includes(n.match);
          return (
            <div key={n.match} className={`cr-ix${on ? ' on' : ''}`}>
              <Link to={n.to} onClick={onClose} className="cr-ix-main">
                <span className="cr-gem sm"><I size={19} strokeWidth={1.7} /></span>
                <span className="cr-ix-t"><b>{it?.name ?? n.label}</b><small>{n.hint}</small></span>
              </Link>
              <button type="button" className={`cr-pin${pinned ? ' on' : ''}`} aria-pressed={pinned} aria-label={pinned ? `Unpin ${n.label} from the dock` : `Pin ${n.label} to the dock`} title={pinned ? 'Unpin from the dock' : 'Pin to bottom bar'} onClick={() => togglePin(n.match)}>
                <Pin size={15} fill={pinned ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="small muted cr-tip">Pin 2–4 sections to the bottom bar. Tap Edit at the top to reorder, hide or rename the menu. Swipe up on the bottom bar to open this page.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().then(() => nav('/'))}><LogOut size={14} />Sign out</button>
    </Sheet>
  );
}

/** Mobil kristal dok: 3 sabit bölüm + ortada "New" mücevheri + "Journal". */
export function Dock() {
  const loc = useLocation();
  const [pins, setPins] = useDockPins();
  const [sheet, setSheet] = useState<'' | 'new' | 'index'>('');
  const names = useNavNames();
  useEffect(() => { setSheet(''); }, [loc.pathname]);
  useEffect(() => {
    const open = (e: Event) => setSheet((e as CustomEvent<'new' | 'index'>).detail);
    document.addEventListener('cr-sheet', open);
    return () => document.removeEventListener('cr-sheet', open);
  }, []);
  const items = pins.map((m) => NAV.find((n) => n.match === m)!).filter(Boolean);
  const half = Math.ceil(items.length / 2);
  const y0 = useRef<number | null>(null);
  const cell = (n: NavItem) => (
    <Link key={n.match} to={n.to} className={isActive(loc.pathname, n) ? 'active' : ''} aria-current={isActive(loc.pathname, n) ? 'page' : undefined}>
      {(() => { const it = names.by.get(n.match); const I = it?.Icon ?? n.Icon; return <><span className="ic"><I size={22} strokeWidth={1.75} /></span><span className="tx">{it && it.name !== n.label ? it.name : n.short}</span></>; })()}
    </Link>
  );
  const inIndex = !items.some((n) => isActive(loc.pathname, n)) && NAV.some((n) => isActive(loc.pathname, n));
  return (
    <>
      <nav className="cr-dock" data-n={items.length} aria-label="Bottom menu"
        onTouchStart={(e) => { y0.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (y0.current != null && y0.current - e.changedTouches[0].clientY > 40) setSheet('index'); y0.current = null; }}>
        {items.slice(0, half).map(cell)}
        <button type="button" className="cr-new" onClick={() => setSheet('new')} aria-label="Add to journal"><span className="cr-new-gem"><Plus size={26} strokeWidth={2.2} /></span></button>
        {items.slice(half).map(cell)}
        <button type="button" className={inIndex ? 'active' : ''} onClick={() => setSheet('index')} aria-label="Contents: all sections">
          <span className="ic"><BookOpen size={22} strokeWidth={1.75} /></span><span className="tx">Journal</span>
        </button>
      </nav>
      {sheet === 'new' && <CreateSheet onClose={() => setSheet('')} />}
      {sheet === 'index' && <IndexSheet onClose={() => setSheet('')} pins={pins} setPins={setPins} />}
    </>
  );
}
