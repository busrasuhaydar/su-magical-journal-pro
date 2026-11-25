// Serbest tuval ve sağ tık menüsü: her ekranda istediğin yere not, bağlantı butonu veya etiket ekle; her şeye (sayfa, proje, eser, kişi, fırsat, etiket, ekran, web) bağla.
// Sağ tık (mobilde uzun bas): yeni görev/etkinlik/gönderi/sayfa/fikir, not/bağlantı butonu, yeniden adlandır, gizle, düzenle.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, EyeOff, FilePlus2, GripVertical, Hash, Lightbulb, Link2, ListPlus, CalendarPlus, Megaphone, Palette, Pencil, RotateCcw, StickyNote, Trash2, Type, X, ExternalLink } from 'lucide-react';
import { Dialog, Field, useToast } from './ui';
import { useEditors } from './Editors';
import { useAllPages, useContacts, useOpportunities, useProfile, useProjects } from '../lib/data';
import { useArtworks } from '../lib/artworks';
import { useTags } from '../lib/tags';
import { useNfts } from '../lib/nft';
import { NAV } from '../crystal/Nav';
import { supabase } from '../lib/supabase';
import { todayKey } from '../lib/dates';
import { usePrefsWriter, type UiPrefs } from '../lib/ui';
import { RenameDialog, useEditMode } from '../lib/layout';
import { listBoxes, renamableAt, routeKey, useFreeActions, type CanvasItem } from '../lib/freeform';

const COLORS = ['#FFF2A8', '#FFD3EA', '#CDEBFF', '#D7F8E0', '#EAD9FF', '#FFE0C7'];
const uid = () => `c_${Math.random().toString(36).slice(2, 9)}`;
const wide = () => window.innerWidth > 760;

// ── Bağlantı seçici ──
export function LinkPicker({ onPick, onClose }: { onPick: (href: string, label: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState('screen');
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const pages = useAllPages(), projects = useProjects(), arts = useArtworks(), contacts = useContacts(), opps = useOpportunities(), tags = useTags(), nfts = useNfts();
  const list: [string, string][] = useMemo(() => {
    const m: Record<string, [string, string][]> = {
      screen: NAV.map((n) => [n.to, n.label]),
      page: (pages.data ?? []).filter((p) => !p.journal_day).map((p) => [`/pages/${p.id}`, `${p.icon ?? '📄'} ${p.title}`]),
      project: (projects.data ?? []).map((p) => [`/projects/${p.slug}`, `${p.icon ?? '✦'} ${p.title}`]),
      artwork: (arts.data ?? []).map((a) => [`/artworks/${a.id}`, a.title]),
      contact: (contacts.data ?? []).map((c) => ['/contacts', c.name]),
      opportunity: (opps.data ?? []).map((o) => [`/opportunities/${o.id}`, o.title]),
      tag: (tags.data ?? []).map((t) => [`/tags/${t.id}`, `#${t.name}`]),
      collection: (nfts.data?.collections ?? []).map((c) => [`/collections/${c.slug}`, c.name]),
    };
    const n = q.toLocaleLowerCase('en');
    return (m[kind] ?? []).filter(([, l]) => l.toLocaleLowerCase('en').includes(n)).slice(0, 80);
  }, [kind, q, pages.data, projects.data, arts.data, contacts.data, opps.data, tags.data, nfts.data]);
  return (
    <Dialog title="Link to…" onClose={onClose}>
      <div className="row" style={{ gap: 6 }}>
        <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => { setKind(e.target.value); setQ(''); }} aria-label="Link type">
          <option value="screen">Screen</option><option value="page">Page</option><option value="project">Project</option><option value="artwork">Artwork</option>
          <option value="contact">Contact</option><option value="opportunity">Opportunity</option><option value="tag">Tag</option><option value="collection">Collection</option><option value="web">Web address</option>
        </select>
        {kind !== 'web' && <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" autoFocus />}
      </div>
      {kind === 'web' ? (
        <div style={{ marginTop: 10 }}>
          <Field label="Address"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus /></Field>
          <button type="button" className="btn btn-primary btn-sm" disabled={!url.trim()} onClick={() => { const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`; try { onPick(u, new URL(u).hostname); } catch { /* geçersiz */ } }}><Check size={13} />Use this link</button>
        </div>
      ) : (
        <div className="lp-list">
          {list.map(([href, label], i) => <button key={href + i} type="button" className="lp-it" onClick={() => onPick(href, label.replace(/^#/, '#'))}><Link2 size={13} />{label}</button>)}
          {!list.length && <p className="small muted">Nothing found.</p>}
        </div>
      )}
    </Dialog>
  );
}

// ── Tuval ──
function ItemView({ it, wrapW, edit, patch, remove, onLink, onRename }: { it: CanvasItem; wrapW: number; edit: boolean; patch: (p: Partial<CanvasItem>) => void; remove: () => void; onLink: () => void; onRename: () => void }) {
  const nav = useNavigate();
  const [live, setLive] = useState<Partial<CanvasItem> | null>(null);
  const v = { ...it, ...live };
  const [text, setText] = useState(it.text ?? '');
  const tm = useRef<number>();
  useEffect(() => { setText(it.text ?? ''); }, [it.text]);
  function drag(e: React.PointerEvent, mode: 'move' | 'size') {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, b = { ...it }; let cur: Partial<CanvasItem> = {};
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      cur = mode === 'move' ? { x: Math.max(0, Math.min(96, b.x + (dx / wrapW) * 100)), y: Math.max(0, b.y + dy) } : { w: Math.max(80, b.w + dx), h: Math.max(32, b.h + dy) };
      setLive(cur);
    };
    const up = () => { window.removeEventListener('pointermove', mv); setLive(null); patch(cur); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up, { once: true });
  }
  const go = () => { if (edit || !v.href) return; if (/^https?:/.test(v.href)) window.open(v.href, '_blank', 'noopener'); else nav(v.href); };
  return (
    <div className={`cv-item cv-${v.kind}${edit ? ' cv-edit' : ''}`} style={{ left: `${v.x}%`, top: v.y, width: v.w, minHeight: v.h, ['--cv' as string]: v.color ?? COLORS[0] }}>
      {edit && (
        <div className="cv-bar fx-ui">
          <button type="button" className="fx-b fx-grip" aria-label="Move" onPointerDown={(e) => drag(e, 'move')}><GripVertical size={14} /></button>
          {v.kind !== 'note' && <button type="button" className="fx-b" aria-label="Rename" onClick={onRename}><Pencil size={13} /></button>}
          {v.kind === 'link' && <button type="button" className="fx-b" aria-label="Change link" onClick={onLink}><Link2 size={13} /></button>}
          <button type="button" className="fx-b" aria-label="Color" onClick={() => patch({ color: COLORS[(COLORS.indexOf(v.color ?? COLORS[0]) + 1) % COLORS.length] })}><Palette size={13} /></button>
          <button type="button" className="fx-b" aria-label="Delete" onClick={remove}><Trash2 size={13} /></button>
        </div>
      )}
      {v.kind === 'note' && <textarea className="cv-note" value={text} placeholder="Note…" aria-label="Note" onChange={(e) => { setText(e.target.value); clearTimeout(tm.current); const x = e.target.value; tm.current = window.setTimeout(() => patch({ text: x }), 700); }} onBlur={() => text !== (it.text ?? '') && patch({ text })} />}
      {v.kind === 'link' && <button type="button" className="cv-link" onClick={go}>{/^https?:/.test(v.href ?? '') ? <ExternalLink size={15} /> : <Link2 size={15} />}<span>{v.text || 'Link'}</span></button>}
      {v.kind === 'label' && <div className="cv-label">{v.text || 'Label'}</div>}
      {edit && <span className="fx-h fx-hc" onPointerDown={(e) => drag(e, 'size')} />}
    </div>
  );
}

export function CanvasLayer() {
  const loc = useLocation();
  const rk = routeKey(loc.pathname);
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  const write = usePrefsWriter();
  const { on } = useEditMode();
  const items = ui.canvas?.[rk] ?? [];
  const ref = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(900);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const set = (f: (l: CanvasItem[]) => CanvasItem[]) => write((u) => ({ ...u, canvas: { ...(u.canvas ?? {}), [rk]: f(u.canvas?.[rk] ?? []) } }));
  useEffect(() => { const f = () => setWrapW(ref.current?.parentElement?.getBoundingClientRect().width ?? 900); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const at = (cx?: number, cy?: number) => {
    const r = ref.current?.parentElement?.getBoundingClientRect();
    if (!r || cx == null || cy == null) return { x: 30, y: ((document.querySelector('.cb-scroll') as HTMLElement | null)?.scrollTop ?? 0) + 120 };
    return { x: Math.max(0, Math.min(90, ((cx - r.left) / r.width) * 100)), y: Math.max(0, cy - r.top) };
  };
  const add = (it: Omit<CanvasItem, 'id'>) => set((l) => [...l, { ...it, id: uid() }]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ kind: CanvasItem['kind']; cx?: number; cy?: number }>).detail;
      const p = at(d.cx, d.cy);
      if (d.kind === 'link') setPick(p);
      else if (d.kind === 'note') add({ kind: 'note', ...p, w: 220, h: 140, text: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] });
      else { add({ kind: 'label', ...p, w: 240, h: 40, text: 'Label', color: '#FFE3F1' }); }
    };
    document.addEventListener('su:add-canvas', h);
    return () => document.removeEventListener('su:add-canvas', h);
  });
  if (!items.length && !pick) return <div ref={ref} className="cv-layer" aria-hidden="true" />;
  return (
    <div ref={ref} className="cv-layer">
      {items.map((it) => (
        <ItemView key={it.id} it={it} wrapW={wrapW} edit={on && wide()}
          patch={(p) => set((l) => l.map((x) => (x.id === it.id ? { ...x, ...p } : x)))} remove={() => set((l) => l.filter((x) => x.id !== it.id))}
          onLink={() => setPick({ x: it.x, y: it.y })} onRename={() => setEdit({ id: it.id, text: it.text ?? '' })} />
      ))}
      {pick && <LinkPicker onClose={() => setPick(null)} onPick={(href, label) => {
        const existing = items.find((i) => Math.abs(i.x - pick.x) < 0.01 && Math.abs(i.y - pick.y) < 0.01 && i.kind === 'link');
        if (existing) set((l) => l.map((x) => (x.id === existing.id ? { ...x, href } : x)));
        else add({ kind: 'link', x: pick.x, y: pick.y, w: 200, h: 44, text: label, href, color: COLORS[1] });
        setPick(null);
      }} />}
      {edit && <RenameDialog name={edit.text} onClose={() => setEdit(null)} onSave={(n) => set((l) => l.map((x) => (x.id === edit.id ? { ...x, text: n } : x)))} />}
    </div>
  );
}

// ── Sağ tık menüsü ──
interface Menu { x: number; y: number; target: EventTarget | null }
export function ContextMenuLayer() {
  const [m, setM] = useState<Menu | null>(null);
  const [ren, setRen] = useState<{ orig: string; cur: string } | null>(null);
  const nav = useNavigate();
  const toast = useToast();
  const { openTask, openEvent, openPost } = useEditors();
  const edit = useEditMode();
  const act = useFreeActions();
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  useEffect(() => {
    const skip = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], .dialog, .cmenu, .block-row, .cmdk, .cr-sheet, .fx-ui, .cb-clone, iframe, canvas');
    const open = (x: number, y: number, t: EventTarget | null) => setM({ x, y, target: t });
    const ctx = (e: MouseEvent) => { if (skip(e.target) || !(e.target as HTMLElement).closest?.('.cb-stage')) return; e.preventDefault(); open(e.clientX, e.clientY, e.target); };
    let tm = 0, sx = 0, sy = 0;
    const ts = (e: TouchEvent) => { if (skip(e.target) || e.touches.length !== 1 || (e.target as HTMLElement).closest?.('.drag-grip, .grip, .ed-chrome, .bt-bar, .cr-dock')) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; const t = e.target; clearTimeout(tm); tm = window.setTimeout(() => open(sx, sy, t), 650); };
    const tmv = (e: TouchEvent) => { if (Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 9) clearTimeout(tm); };
    const tend = () => clearTimeout(tm);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setM(null);
    document.addEventListener('contextmenu', ctx);
    document.addEventListener('touchstart', ts, { passive: true }); document.addEventListener('touchmove', tmv, { passive: true }); document.addEventListener('touchend', tend); document.addEventListener('touchcancel', tend);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('contextmenu', ctx); document.removeEventListener('touchstart', ts); document.removeEventListener('touchmove', tmv); document.removeEventListener('touchend', tend); document.removeEventListener('touchcancel', tend); document.removeEventListener('keydown', esc); };
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!m) return;
    const h = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setM(null); };
    const t = setTimeout(() => { document.addEventListener('mousedown', h); document.addEventListener('touchstart', h); document.addEventListener('scroll', () => setM(null), { capture: true, once: true }); });
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [m]);
  if (!m && !ren) return null;
  const tx = m ? renamableAt(m.target) : null;
  const box = m ? listBoxes().find((b) => b.el.contains(m.target as Node)) : undefined;
  const hid = tx?.interactive && ui.hidden_ui?.includes(`${act.rk}|${tx.orig}`);
  const run = (f: () => void) => { setM(null); setTimeout(f, 20); };
  const cv = (kind: CanvasItem['kind']) => run(() => document.dispatchEvent(new CustomEvent('su:add-canvas', { detail: { kind, cx: m!.x, cy: m!.y } })));
  async function newPage() { const { data, error } = await supabase.from('pages').insert({ title: 'Untitled page', icon: '📄', project_id: null, parent_id: null, position: Date.now() / 1e6 }).select('id').single(); if (error) return toast.fail(error); nav(`/pages/${data.id}`); }
  async function newIdea() { const { error } = await supabase.from('ideas').insert({ title: 'New idea', category: 'art' }); if (error) return toast.fail(error); toast.ok('Idea added'); nav('/ideas'); }
  const W = 232, H = 420;
  const pos = m ? { left: Math.min(m.x, window.innerWidth - W - 8), top: Math.max(8, Math.min(m.y, window.innerHeight - H - 8)) } : undefined;
  const It = ({ I, label, onClick, danger }: { I: typeof Type; label: string; onClick: () => void; danger?: boolean }) => <button type="button" role="menuitem" className={danger ? 'danger' : ''} onClick={onClick}><I size={15} /><span>{label}</span></button>;
  return (
    <>
      {m && (
        <div ref={ref} className="cmenu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
          {(tx || box) && <div className="cm-cap">{tx ? `“${(tx.orig).slice(0, 26)}”` : 'This box'}</div>}
          {tx && <It I={Pencil} label="Rename…" onClick={() => run(() => setRen({ orig: tx.orig, cur: ui.renames?.[tx.orig] ?? tx.orig }))} />}
          {tx?.interactive && <It I={hid ? RotateCcw : EyeOff} label={hid ? 'Show this button' : 'Hide this button'} onClick={() => run(() => act.toggleHide(tx.orig))} />}
          {box && <It I={EyeOff} label="Hide this box" onClick={() => run(() => act.setBox(box.key, { ...(ui.boxes?.[act.rk]?.[box.key] ?? {}), hide: true }))} />}
          {box && <It I={GripVertical} label="Move & resize…" onClick={() => run(() => edit.set(true))} />}
          <div className="cm-cap">Add here</div>
          <It I={StickyNote} label="Note" onClick={() => cv('note')} />
          <It I={Link2} label="Link button…" onClick={() => cv('link')} />
          <It I={Type} label="Text label" onClick={() => cv('label')} />
          <div className="cm-cap">Create</div>
          <It I={ListPlus} label="Task" onClick={() => run(() => openTask({ due_date: todayKey() }))} />
          <It I={CalendarPlus} label="Event" onClick={() => run(() => openEvent({}))} />
          <It I={Megaphone} label="Post" onClick={() => run(() => openPost({}))} />
          <It I={FilePlus2} label="Page" onClick={() => run(newPage)} />
          <It I={Lightbulb} label="Idea" onClick={() => run(newIdea)} />
          <div className="cm-sep" />
          <It I={Pencil} label={edit.on ? 'Done editing layout' : 'Edit layout'} onClick={() => run(() => edit.set(!edit.on))} />
          <It I={RotateCcw} label="Reset this screen’s tweaks" onClick={() => run(act.resetScreen)} danger />
        </div>
      )}
      {ren && <RenameDialog name={ren.cur} onClose={() => setRen(null)} onSave={(n) => act.rename(ren.orig, n)} />}
    </>
  );
}
void Hash; void X;
