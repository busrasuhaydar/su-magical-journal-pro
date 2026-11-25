// Listeler: elle sürükleyerek sıralama (position alanı) ve kalıcı "elle / tarih / öncelik / ad" seçimi + görünüm tercihi (profiles.ui_prefs).
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import { ArrowUpDown, GripVertical } from 'lucide-react';
import { useProfile } from './data';
import { usePrefsWriter } from './ui';
import { supabase } from './supabase';
import { Sortable, useSortItem } from './layout';
import { useToast } from '../components/ui';

export type SortMode = 'manual' | 'date' | 'priority' | 'name';
const SORT_LABEL: Record<SortMode, string> = { manual: 'Manual', date: 'Date', priority: 'Priority', name: 'Name' };

export function useListPrefs<V extends string = string>(key: string, def: SortMode = 'date', defView?: V) {
  const ui = useProfile().data?.ui_prefs ?? {};
  const write = usePrefsWriter();
  return {
    mode: ((ui.sort?.[key] as SortMode) ?? def),
    setMode: (m: SortMode) => write((u) => ({ ...u, sort: { ...(u.sort ?? {}), [key]: m } })),
    view: ((ui.view?.[key] as V) ?? defView) as V,
    setView: (v: V) => write((u) => ({ ...u, view: { ...(u.view ?? {}), [key]: v } })),
  };
}

type Acc<T> = { date?: (t: T) => string | null | undefined; priority?: (t: T) => number; name?: (t: T) => string; desc?: boolean };
export function sortList<T extends { id: string; position?: number | null }>(list: T[], mode: SortMode, acc: Acc<T>): T[] {
  const out = [...list];
  const byDate = (a: T, b: T) => { const x = acc.date?.(a) ?? '9999', y = acc.date?.(b) ?? '9999'; return acc.desc ? y.localeCompare(x) : x.localeCompare(y); };
  if (mode === 'manual') return out.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || byDate(a, b));
  if (mode === 'priority' && acc.priority) return out.sort((a, b) => acc.priority!(a) - acc.priority!(b) || byDate(a, b));
  if (mode === 'name' && acc.name) return out.sort((a, b) => acc.name!(a).localeCompare(acc.name!(b), 'en', { sensitivity: 'base' }));
  return acc.date ? out.sort(byDate) : out;
}

export function SortPicker({ mode, onChange, options = ['manual', 'date', 'priority', 'name'], id }: { mode: SortMode; onChange: (m: SortMode) => void; options?: SortMode[]; id: string }) {
  return (
    <label className="sort-pick" htmlFor={id} title="Sort">
      <ArrowUpDown size={14} />
      <select id={id} className="select" value={mode} onChange={(e) => onChange(e.target.value as SortMode)} aria-label="Sort by">
        {options.map((o) => <option key={o} value={o}>{SORT_LABEL[o]}</option>)}
      </select>
    </label>
  );
}

/** Sürükle-bırak sonrası sırayı yazar (önce önbellek, sonra tek RPC). */
export function useReorder(table: string, keys: unknown[][]) {
  const qc = useQueryClient();
  const toast = useToast();
  return async (ids: string[], from: string, to: string) => {
    const a = ids.indexOf(from), b = ids.indexOf(to);
    if (a < 0 || b < 0) return;
    const next = arrayMove(ids, a, b);
    const pos = new Map(next.map((id, i) => [id, i + 1]));
    keys.forEach((k) => qc.setQueriesData({ queryKey: k }, (old: unknown) => (Array.isArray(old) ? old.map((r: { id?: string }) => (r && r.id && pos.has(r.id) ? { ...r, position: pos.get(r.id) } : r)) : old)));
    const { error } = await supabase.rpc('set_positions', { p_table: table, p_ids: next });
    if (error) { toast.fail(error); keys.forEach((k) => qc.invalidateQueries({ queryKey: k })); }
  };
}

export function DragList({ ids, enabled, onMove, children }: { ids: string[]; enabled: boolean; onMove: (from: string, to: string) => void; children: ReactNode }) {
  return <Sortable ids={ids} onMove={onMove} disabled={!enabled}>{children}</Sortable>;
}
/** Satır: elle sıralamada solda tutamaç (uzun bas / sürükle). */
export function DragRow({ id, enabled, children, className = '' }: { id: string; enabled: boolean; children: ReactNode; className?: string }) {
  const s = useSortItem(id, !enabled);
  if (!enabled) return <>{children}</>;
  return (
    <div ref={s.ref} style={s.style} className={`drag-row ${className}${s.dragging ? ' ed-drag' : ''}`}>
      <button type="button" className="drag-grip" aria-label="Drag to reorder" title="Drag to reorder" {...s.handle}><GripVertical size={15} /></button>
      <div className="drag-body">{children}</div>
    </div>
  );
}
