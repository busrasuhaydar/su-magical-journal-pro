// Düzenleme modu ve ekran düzenleri (sıra, gizle, ad, simge, boyut). Tümü profiles.ui_prefs.layout içinde; cihazlar arasında eşitlenir.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Eye, EyeOff, GripVertical, Pencil, RotateCcw, type LucideIcon } from 'lucide-react';
import { useProfile } from './data';
import { usePrefsWriter, type UiPrefs } from './ui';
import { ICONS, iconOf } from './icons';
import { Dialog, Field } from '../components/ui';

export type Size = 's' | 'm' | 'l';
export interface CustomCard { id: string; type: 'page' | 'collection' | 'tag' | 'image' | 'quote' | 'counter' | 'note'; ref?: string; text?: string; date?: string; file?: string }
export interface ScreenLayout { order?: string[]; hidden?: string[]; names?: Record<string, string>; icons?: Record<string, string>; sizes?: Record<string, Size>; custom?: CustomCard[]; groups?: { id: string; label: string }[]; collapsed?: string[] }
export interface LayoutDef { id: string; label: string; icon?: LucideIcon; size?: Size }
export interface LayoutItem extends LayoutDef { name: string; hidden: boolean; size: Size; Icon?: LucideIcon; iconName?: string }

// ── Düzenleme modu ──
interface EditCtx { on: boolean; set: (v: boolean) => void; screens: Set<string>; register: (s: string) => () => void }
const Ctx = createContext<EditCtx>({ on: false, set: () => {}, screens: new Set(), register: () => () => {} });
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [on, set] = useState(false);
  const [screens, setScreens] = useState<Set<string>>(() => new Set());
  const loc = useLocation();
  useEffect(() => { set(false); }, [loc.pathname]);
  useEffect(() => { document.documentElement.classList.toggle('editing', on); }, [on]);
  const register = useCallback((s: string) => {
    setScreens((p) => (p.has(s) ? p : new Set(p).add(s)));
    return () => setScreens((p) => { const n = new Set(p); n.delete(s); return n; });
  }, []);
  const v = useMemo(() => ({ on, set, screens, register }), [on, screens, register]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export const useEditMode = () => useContext(Ctx);

// ── Ekran düzeni ──
export function applyOrder<T extends { id: string }>(defs: T[], order?: string[]): T[] {
  if (!order?.length) return defs;
  const byId = new Map(defs.map((d) => [d.id, d]));
  const out: T[] = [];
  order.forEach((id) => { const d = byId.get(id); if (d) { out.push(d); byId.delete(id); } });
  defs.forEach((d, i) => { if (byId.has(d.id)) out.splice(Math.min(i, out.length), 0, d); });
  return out;
}
export function useLayout(screen: string, defs: LayoutDef[], opts: { register?: boolean; fallbackHidden?: string[] } = {}) {
  const ui: UiPrefs = useProfile().data?.ui_prefs ?? {};
  const write = usePrefsWriter();
  const { register } = useEditMode();
  useEffect(() => (opts.register === false ? undefined : register(screen)), [screen, register, opts.register]);
  const raw: ScreenLayout = ui.layout?.[screen] ?? {};
  const lay: ScreenLayout = raw.hidden || !opts.fallbackHidden ? raw : { ...raw, hidden: opts.fallbackHidden };
  const items: LayoutItem[] = applyOrder(defs, lay.order).map((d) => {
    const iconName = lay.icons?.[d.id];
    return { ...d, name: lay.names?.[d.id]?.trim() || d.label, hidden: (lay.hidden ?? []).includes(d.id), size: lay.sizes?.[d.id] ?? d.size ?? 'm', Icon: iconOf(iconName, d.icon ?? ICONS.Sparkles), iconName };
  });
  const set = (f: (l: ScreenLayout) => ScreenLayout) => write((u) => ({ ...u, layout: { ...(u.layout ?? {}), [screen]: f(u.layout?.[screen] ?? {}) } }));
  return {
    items, layout: lay,
    visible: items.filter((i) => !i.hidden),
    isHidden: (id: string) => (lay.hidden ?? []).includes(id),
    nameOf: (id: string, d: string) => lay.names?.[id]?.trim() || d,
    set,
    move: (from: string, to: string) => set((l) => {
      const ids = items.map((i) => i.id);
      const a = ids.indexOf(from), b = ids.indexOf(to);
      return a < 0 || b < 0 ? l : { ...l, order: arrayMove(ids, a, b) };
    }),
    toggle: (id: string) => set((l) => { const h = l.hidden ?? lay.hidden ?? []; return { ...l, hidden: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] }; }),
    rename: (id: string, name: string, icon?: string | null) => set((l) => ({ ...l, names: { ...(l.names ?? {}), [id]: name }, icons: icon === undefined ? l.icons : { ...(l.icons ?? {}), [id]: icon ?? '' } })),
    resize: (id: string, s: Size) => set((l) => ({ ...l, sizes: { ...(l.sizes ?? {}), [id]: s } })),
    reset: () => set(() => ({})),
  };
}
export type UseLayout = ReturnType<typeof useLayout>;

/** Tüm düzen sıfırlama (EditBar'daki "Varsayılana dön"). */
export function useResetScreens() {
  const write = usePrefsWriter();
  return (screens: string[]) => write((u) => { const l = { ...(u.layout ?? {}) }; screens.forEach((s) => delete l[s]); return { ...u, layout: l }; });
}

// ── Sürükle-bırak ──
export function Sortable({ ids, onMove, children, disabled }: { ids: string[]; onMove: (from: string, to: string) => void; children: ReactNode; disabled?: boolean }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const end = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) onMove(String(e.active.id), String(e.over.id)); };
  if (disabled) return <>{children}</>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}
export function useSortItem(id: string, disabled?: boolean) {
  const s = useSortable({ id, disabled });
  const style: CSSProperties = { transform: CSS.Translate.toString(s.transform), transition: s.transition, zIndex: s.isDragging ? 5 : undefined, position: s.isDragging ? 'relative' : undefined };
  return { ref: s.setNodeRef, style, handle: { ...s.attributes, ...s.listeners }, dragging: s.isDragging, setActivator: s.setActivatorNodeRef };
}

/** Düzenleme modunda öğe üstünde: tutamaç, göz, kalem (ve isteğe bağlı boyut). */
export function EditChrome({ item, lay, handle, sizes, extra }: { item: LayoutItem; lay: UseLayout; handle: Record<string, unknown>; sizes?: boolean; extra?: ReactNode }) {
  const [ren, setRen] = useState(false);
  return (
    <span className="ed-chrome" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="ed-btn ed-grip" aria-label={`Drag ${item.name}`} title="Drag to reorder" {...handle}><GripVertical size={15} /></button>
      <button type="button" className={`ed-btn${item.hidden ? ' off' : ''}`} aria-pressed={!item.hidden} aria-label={item.hidden ? `Show ${item.name}` : `Hide ${item.name}`} title={item.hidden ? 'Show' : 'Hide'} onClick={() => lay.toggle(item.id)}>{item.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      <button type="button" className="ed-btn" aria-label={`Rename ${item.name}`} title="Rename, change icon" onClick={() => setRen(true)}><Pencil size={14} /></button>
      {sizes && (['s', 'm', 'l'] as Size[]).map((s) => (
        <button key={s} type="button" className={`ed-btn ed-size${item.size === s ? ' on' : ''}`} aria-pressed={item.size === s} title={{ s: 'Small', m: 'Medium', l: 'Wide' }[s]} onClick={() => lay.resize(item.id, s)}>{s.toUpperCase()}</button>
      ))}
      {extra}
      {ren && <RenameDialog name={item.name} icon={item.iconName} withIcon={!!item.icon} onClose={() => setRen(false)} onSave={(n, i) => lay.rename(item.id, n, item.icon ? i : undefined)} />}
    </span>
  );
}

export function RenameDialog({ name, icon, withIcon, onClose, onSave }: { name: string; icon?: string; withIcon?: boolean; onClose: () => void; onSave: (name: string, icon: string | null) => void }) {
  const [n, setN] = useState(name);
  const [ic, setIc] = useState<string | null>(icon || null);
  const save = () => { onSave(n.trim(), ic); onClose(); };
  return (
    <Dialog title="Rename" onClose={onClose}>
      <Field label="Name"><input className="input" value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder={name} /></Field>
      {withIcon && (
        <div className="ed-icons" role="radiogroup" aria-label="Icon">
          {Object.entries(ICONS).map(([k, I]) => (
            <button key={k} type="button" role="radio" aria-checked={ic === k} className={`ed-ic${ic === k ? ' on' : ''}`} title={k} onClick={() => setIc(ic === k ? null : k)}><I size={18} /></button>
          ))}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}><Check size={14} />Save</button>
      </div>
    </Dialog>
  );
}

/** Basit sıralanabilir liste satırı: düzenleme modunda chrome gösterir. */
export function EditableItem({ item, lay, children, className = '', sizes, as = 'div', extra }: { item: LayoutItem; lay: UseLayout; children: ReactNode; className?: string; sizes?: boolean; as?: 'div' | 'section' | 'li'; extra?: ReactNode }) {
  const { on } = useEditMode();
  const s = useSortItem(item.id, !on);
  if (!on && item.hidden) return null;
  const Tag = as;
  return (
    <Tag ref={s.ref as never} style={s.style} className={`ed-item ${className}${on ? ' ed-on' : ''}${item.hidden ? ' ed-hidden' : ''}${s.dragging ? ' ed-drag' : ''}`} data-size={item.size}>
      {on && <EditChrome item={item} lay={lay} handle={s.handle} sizes={sizes} extra={extra} />}
      {children}
    </Tag>
  );
}

/** utilbar'daki "Düzenle / Bitti" düğmesi. */
export function EditToggle() {
  const { on, set } = useEditMode();
  return (
    <button type="button" className={`btn btn-sm ${on ? 'btn-primary' : 'btn-glass'} ed-toggle`} aria-pressed={on} onClick={() => set(!on)} title={on ? 'Lock layout' : 'Edit layout: reorder, hide, rename'}>
      {on ? <Check size={14} /> : <Pencil size={14} />}<span className="ed-toggle-t">{on ? 'Done' : 'Edit'}</span>
    </button>
  );
}

/** Düzenleme modunda sayfa üstünde ince çubuk. */
export function EditBar() {
  const { on, set, screens } = useEditMode();
  const reset = useResetScreens();
  const [ask, setAsk] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setAsk(false); }, [on]);
  if (!on) return null;
  const list = [...screens].filter((s) => s !== 'nav');
  return (
    <div className="ed-bar" ref={ref} role="status">
      <span className="ed-bar-t"><Pencil size={14} /> Drag <GripVertical size={13} /> to reorder · <Eye size={13} /> hide · <Pencil size={12} /> rename</span>
      {ask ? (
        <span className="row" style={{ gap: 6 }}>
          <span className="small">Reset this screen?</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => { reset(list.length ? list : ['nav']); setAsk(false); }}><RotateCcw size={13} />Yes</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(false)}>No</button>
        </span>
      ) : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(true)}><RotateCcw size={13} />Reset to default</button>}
      <button type="button" className="btn btn-primary btn-sm" onClick={() => set(false)}><Check size={14} />Done</button>
    </div>
  );
}
