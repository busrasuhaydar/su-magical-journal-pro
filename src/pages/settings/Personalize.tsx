// Ayarlar · kişiselleştirme: tanımlar, takvim, görünüm, düzen yedeği. Tümü profiles.ui_prefs'te (cihazlar arasında eşitlenir).
import { useState } from 'react';
import { ArrowDown, ArrowUp, Download, ImageIcon, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Field, useToast } from '../../components/ui';
import { useProfile } from '../../lib/data';
import { usePrefsWriter, type UiPrefs } from '../../lib/ui';
import { supabase } from '../../lib/supabase';
import { CAL_TYPES, DEF_TITLES, baseCategories, baseLabels, defColor, type CalPrefs, type DefKind, type Defs, type LookPrefs } from '../../lib/defs';
import { useArtworks } from '../../lib/artworks';
import { useFiles } from '../../lib/data';
import { todayKey } from '../../lib/dates';

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
const ENUM: Record<DefKind, string> = { task_status: 'task_status', priority: 'priority', project_status: 'project_status', opp_status: 'opp_status' };

function useUi() {
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  return { ui, write: usePrefsWriter() };
}

function DefList({ kind }: { kind: DefKind }) {
  const { ui, write } = useUi();
  const toast = useToast();
  const defs: Defs = ui.defs ?? {};
  const base = baseLabels(kind) as Record<string, string>;
  const over = defs[kind] ?? {};
  const keys = [...Object.keys(base), ...Object.keys(over).filter((k) => !(k in base))];
  const [nw, setNw] = useState('');
  const put = (k: string, patch: { label?: string; color?: string }) => write((u) => { const d = u.defs ?? {}; return { ...u, defs: { ...d, [kind]: { ...(d[kind] ?? {}), [k]: { ...(d[kind]?.[k] ?? {}), ...patch } } } }; });
  async function add() {
    const label = nw.trim(); const v = slug(label);
    if (!v) return;
    if (keys.includes(v)) return toast.fail(new Error('This value already exists'));
    const { error } = await supabase.rpc('add_enum_value', { p_type: ENUM[kind], p_value: v });
    if (error) return toast.fail(error);
    put(v, { label }); setNw(''); toast.ok('Added ✦');
  }
  return (
    <details className="def-box">
      <summary><b>{DEF_TITLES[kind]}</b> <span className="small muted">{keys.length}</span></summary>
      <div className="def-list">
        {keys.map((k) => (
          <div key={k} className="def-row">
            <input type="color" className="def-color" aria-label={`Color for ${base[k] ?? k}`} value={defColor(kind, k, defs)} onChange={(e) => put(k, { color: e.target.value })} />
            <input className="input" value={over[k]?.label ?? ''} placeholder={base[k] ?? k} aria-label={`Name for ${base[k] ?? k}`} onChange={(e) => put(k, { label: e.target.value })} />
            {over[k] && (k in base) && <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label="Reset" title="Reset" onClick={() => write((u) => { const d = { ...(u.defs?.[kind] ?? {}) }; delete d[k]; return { ...u, defs: { ...(u.defs ?? {}), [kind]: d } }; })}><RotateCcw size={13} /></button>}
          </div>
        ))}
        <div className="def-row">
          <input className="input" value={nw} onChange={(e) => setNw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New value…" aria-label={`New ${DEF_TITLES[kind]}`} />
          <button type="button" className="btn btn-glass btn-sm" onClick={add} disabled={!nw.trim()}><Plus size={13} />Add</button>
        </div>
      </div>
    </details>
  );
}

function Categories() {
  const { ui, write } = useUi();
  const list = ui.defs?.categories?.length ? ui.defs.categories : baseCategories();
  const colors = ui.defs?.category_colors ?? {};
  const [nw, setNw] = useState('');
  const set = (l: string[], c = colors) => write((u) => ({ ...u, defs: { ...(u.defs ?? {}), categories: l, category_colors: c } }));
  const mv = (i: number, d: number) => { const l = [...list]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(l); };
  return (
    <details className="def-box">
      <summary><b>Task categories</b> <span className="small muted">{list.length}</span></summary>
      <p className="small muted">Renaming a category here changes the list for new tasks; existing tasks keep their saved category.</p>
      <div className="def-list">
        {list.map((c, i) => (
          <div key={c + i} className="def-row">
            <input type="color" className="def-color" aria-label={`Color for ${c}`} value={colors[c] ?? '#E2558C'} onChange={(e) => set(list, { ...colors, [c]: e.target.value })} />
            <input className="input" defaultValue={c} aria-label="Category name" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c) { const l = [...list]; l[i] = v; set(l); } }} />
            <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label="Move up" onClick={() => mv(i, -1)}><ArrowUp size={13} /></button>
            <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label="Move down" onClick={() => mv(i, 1)}><ArrowDown size={13} /></button>
            <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label={`Remove ${c}`} onClick={() => set(list.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
        ))}
        <div className="def-row">
          <input className="input" value={nw} onChange={(e) => setNw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nw.trim()) { set([...list, nw.trim()]); setNw(''); } }} placeholder="New category…" aria-label="New category" />
          <button type="button" className="btn btn-glass btn-sm" disabled={!nw.trim()} onClick={() => { set([...list, nw.trim()]); setNw(''); }}><Plus size={13} />Add</button>
        </div>
      </div>
    </details>
  );
}

export function DefinitionSettings() {
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Definitions</h2><span className="small muted">On all devices</span></div>
      <p className="small muted" style={{ marginTop: 0 }}>Rename statuses, priorities and stages, choose their colors, or add new values. Existing records are never changed.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <DefList kind="task_status" /><Categories /><DefList kind="priority" /><DefList kind="project_status" /><DefList kind="opp_status" />
      </div>
    </section>
  );
}

export function CalendarSettings() {
  const { ui, write } = useUi();
  const c: CalPrefs = ui.calendar ?? {};
  const set = (p: Partial<CalPrefs>) => write((u) => ({ ...u, calendar: { ...(u.calendar ?? {}), ...p } }));
  const types = c.types?.length ? c.types : CAL_TYPES.map((t) => t[0]);
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Calendar</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => write((u) => ({ ...u, calendar: {} }))}><RotateCcw size={13} />Reset to default</button></div>
      <div className="grid-2">
        <Field label="Default view">
          <select className="select" value={c.view ?? 'month'} onChange={(e) => set({ view: e.target.value as CalPrefs['view'] })}>
            <option value="year">Year</option><option value="month">Month</option><option value="week">Week</option><option value="agenda">Agenda</option>
          </select>
        </Field>
        <Field label="First day of the week">
          <select className="select" value={String(c.weekStart ?? 1)} onChange={(e) => set({ weekStart: Number(e.target.value) as 1 | 0 | 6 })}>
            <option value="1">Monday</option><option value="0">Sunday</option><option value="6">Saturday</option>
          </select>
        </Field>
      </div>
      <div className="def-list" style={{ marginTop: 8 }}>
        {CAL_TYPES.map(([k, l, d]) => (
          <label key={k} className="def-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={types.includes(k)} onChange={() => set({ types: types.includes(k) ? types.filter((x) => x !== k) : [...types, k] })} />
            <input type="color" className="def-color" aria-label={`Color for ${l}`} value={c.colors?.[k] ?? d} onChange={(e) => set({ colors: { ...(c.colors ?? {}), [k]: e.target.value } })} />
            <span>{l}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

const ACCENTS = ['', '#FF4FA8', '#9C72F0', '#22CFC6', '#4FA3FF', '#F2B52E', '#FF6E5A', '#3FD98A'];
export function AppearanceSettings() {
  const { ui, write } = useUi();
  const l: LookPrefs = ui.look ?? {};
  const arts = useArtworks();
  const files = useFiles();
  const [pick, setPick] = useState(false);
  const set = (p: Partial<LookPrefs>) => write((u) => ({ ...u, look: { ...(u.look ?? {}), ...p } }));
  const useArt = (id: string) => {
    const a = arts.data?.find((x) => x.id === id); if (!a) return;
    const path = a.file_id ? files.data?.find((f) => f.id === a.file_id)?.storage_path : a.nft_image;
    if (!path) return;
    write((u) => ({ ...u, bg: path, look: { ...(u.look ?? {}), bgArtwork: id } }));
    setPick(false);
  };
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Appearance</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => write((u) => ({ ...u, look: {} }))}><RotateCcw size={13} />Reset to default</button></div>
      <Field label="Theme color">
        <div className="row" style={{ gap: 6 }}>
          {ACCENTS.map((a) => (
            <button key={a || 'def'} type="button" className={`look-sw${(l.accent ?? '') === a ? ' on' : ''}`} style={{ background: a || 'linear-gradient(135deg,#FF8CC6,#22CFC6)' }} aria-label={a ? `Theme color ${a}` : 'Default colors'} aria-pressed={(l.accent ?? '') === a} onClick={() => set({ accent: a || undefined })} />
          ))}
          <input type="color" className="def-color" aria-label="Custom theme color" value={l.accent ?? '#FF4FA8'} onChange={(e) => set({ accent: e.target.value })} />
        </div>
      </Field>
      <div className="grid-2">
        <Field label="Effects">
          <select className="select" value={l.effects ?? 'high'} onChange={(e) => set({ effects: e.target.value as LookPrefs['effects'] })}>
            <option value="high">High (full crystal)</option><option value="medium">Medium</option><option value="simple">Simple (fastest)</option>
          </select>
        </Field>
        <Field label="Font">
          <select className="select" value={l.font ?? 'default'} onChange={(e) => set({ font: e.target.value as LookPrefs['font'] })}>
            <option value="default">Default</option><option value="serif">Elegant serif</option><option value="rounded">Rounded</option><option value="system">System</option><option value="mono">Typewriter</option>
          </select>
        </Field>
      </div>
      <Field label={`Text size · ${l.scale ?? 100}%`}>
        <input type="range" min={85} max={125} step={5} value={l.scale ?? 100} onChange={(e) => set({ scale: Number(e.target.value) })} aria-label="Text size" style={{ width: '100%' }} />
      </Field>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-glass btn-sm" onClick={() => setPick((v) => !v)}><ImageIcon size={14} />Background from my artworks</button>
      </div>
      {pick && (
        <div className="look-arts">
          {(arts.data ?? []).filter((a) => a.file_id || a.nft_image).slice(0, 60).map((a) => {
            const f = a.file_id ? files.data?.find((x) => x.id === a.file_id) : undefined;
            return <button key={a.id} type="button" className={`look-art${l.bgArtwork === a.id ? ' on' : ''}`} title={a.title} onClick={() => useArt(a.id)}>{a.nft_image && !f ? <img src={a.nft_image} alt={a.title} loading="lazy" /> : <span className="small">{a.title}</span>}</button>;
          })}
          {!arts.data?.length && <p className="small muted">No artworks yet.</p>}
        </div>
      )}
    </section>
  );
}

export function LayoutBackup() {
  const { ui, write } = useUi();
  const toast = useToast();
  const KEYS: (keyof UiPrefs)[] = ['layout', 'home_presets', 'home_active', 'dock', 'nav_pins', 'sort', 'view', 'defs', 'calendar', 'look', 'titles', 'hide', 'boston', 'boxes', 'renames', 'hidden_ui', 'canvas'];
  function exp() {
    const out: Partial<UiPrefs> = {};
    KEYS.forEach((k) => { if (ui[k] !== undefined) (out as Record<string, unknown>)[k] = ui[k]; });
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'su-layout', v: 1, prefs: out }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `journal-layout-${todayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function imp(f: File) {
    try {
      const j = JSON.parse(await f.text());
      if (j?.kind !== 'su-layout' || typeof j.prefs !== 'object') throw new Error('This is not a layout file');
      const p: Partial<UiPrefs> = {};
      KEYS.forEach((k) => { if (k in j.prefs) (p as Record<string, unknown>)[k] = j.prefs[k]; });
      write((u) => ({ ...u, ...p }));
      toast.ok('Layout imported ✦');
    } catch (x) { toast.fail(x); }
  }
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Layout</h2></div>
      <p className="small muted" style={{ marginTop: 0 }}>Tap <b>Edit</b> at the top of any screen to reorder, hide or rename. Here you can save your whole layout (menu, home, tabs, definitions, calendar, appearance) as a file or load it back.</p>
      <div className="row">
        <button type="button" className="btn btn-glass" onClick={exp}><Download size={15} />Export layout</button>
        <label className="btn btn-glass"><Upload size={15} />Import layout<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) imp(f); }} /></label>
      </div>
    </section>
  );
}
