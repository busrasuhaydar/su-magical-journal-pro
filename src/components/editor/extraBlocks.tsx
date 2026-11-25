// Ek bloklar: "/çizim" (parmak/kalem çizimi, basınca duyarlı kalınlık, renk, silgi, geri al; PNG files'a, vuruşlar jsonb'de)
// ve "/buton" (tıklanınca şablon blokları ya da görev seti ekler).
import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Brush, Check, Eraser, MousePointerClick, Pencil, Plus, Trash2, Undo2, X, type Type } from 'lucide-react';
import type { BlockType, PageBlock } from '../../lib/types';
import { uploadFile, useFiles } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { Thumb } from '../Media';
import { useToast } from '../ui';
import { splitLines } from './blockParts';

export const EXTRA_BLOCKS: [BlockType, string, typeof Type, string][] = [
  ['drawing', 'Drawing', Brush, 'drawing draw sketch pen çizim'],
  ['button', 'Button', MousePointerClick, 'button template tasks buton şablon'],
];
export function extraSlash(t: BlockType): Partial<PageBlock['content']> | null {
  if (t === 'drawing') return { strokes: [], w: 800, h: 500 };
  if (t === 'button') return { label: '', action: { kind: 'tasks', lines: '' } };
  return null;
}
export interface ExtraProps { b: PageBlock; onChange: (patch: Partial<PageBlock>) => void; pageId: string; projectId: string | null; insertBlocks?: (bs: { type: BlockType; text: string; checked?: boolean }[]) => void }
export function ExtraBlock(p: ExtraProps) {
  if (p.b.type === 'drawing') return <DrawingBlock {...p} />;
  if (p.b.type === 'button') return <ButtonBlock {...p} />;
  return null;
}

// ── Çizim ──
type Stroke = { c: string; s: number; e?: boolean; p: [number, number, number][] };
const PEN_COLORS = ['#3B1F4E', '#FF4FA8', '#9C72F0', '#1C5FC9', '#22CFC6', '#2E9E6E', '#F2B52E', '#FF6E5A'];
function draw(ctx: CanvasRenderingContext2D, st: Stroke[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  for (const s of st) {
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < s.p.length; i++) {
      const [x0, y0] = s.p[i - 1], [x1, y1, pr] = s.p[i];
      ctx.lineWidth = s.e ? s.s * 4 : s.s * (0.35 + pr * 1.3);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    if (s.p.length === 1) { const [x, y] = s.p[0]; ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(x, y, s.s / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalCompositeOperation = 'source-over';
}
function DrawingBlock({ b, onChange }: ExtraProps) {
  const files = useFiles();
  const qc = useQueryClient();
  const toast = useToast();
  const W = b.content.w ?? 800, H = b.content.h ?? 500;
  const [editing, setEditing] = useState(!b.file_id);
  const [strokes, setStrokes] = useState<Stroke[]>(() => (b.content.strokes as Stroke[] | undefined) ?? []);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [size, setSize] = useState(4);
  const [eraser, setEraser] = useState(false);
  const [busy, setBusy] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const cur = useRef<Stroke | null>(null);
  useEffect(() => { const c = cv.current; if (c) draw(c.getContext('2d')!, strokes, W, H); }, [strokes, editing, W, H]);
  const pt = (e: RPE<HTMLCanvasElement>): [number, number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const pr = e.pointerType === 'pen' || (e.pressure > 0 && e.pressure !== 0.5) ? e.pressure : 0.5;
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H), Math.round(pr * 100) / 100];
  };
  const down = (e: RPE<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); cur.current = { c: color, s: size, e: eraser || undefined, p: [pt(e)] }; };
  const move = (e: RPE<HTMLCanvasElement>) => {
    const s = cur.current; if (!s) return;
    const native = e.nativeEvent as PointerEvent;
    const evs = native.getCoalescedEvents?.() ?? [native];
    for (const ev of evs) { const r = e.currentTarget.getBoundingClientRect(); s.p.push([Math.round(((ev.clientX - r.left) / r.width) * W), Math.round(((ev.clientY - r.top) / r.height) * H), ev.pointerType === 'pen' ? Math.round(ev.pressure * 100) / 100 : 0.5]); }
    const ctx = e.currentTarget.getContext('2d')!; draw(ctx, [...strokes, s], W, H);
  };
  const up = () => { const s = cur.current; cur.current = null; if (s) setStrokes((x) => [...x, s]); };
  async function save() {
    const c = cv.current; if (!c) return;
    setBusy(true);
    try {
      const blob: Blob = await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('Could not export drawing'))), 'image/png'));
      const { rec } = await uploadFile(new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' }));
      qc.invalidateQueries({ queryKey: ['files'] });
      onChange({ file_id: rec.id, content: { ...b.content, strokes, w: W, h: H } });
      setEditing(false); toast.ok('Drawing saved ✦');
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  if (!editing) {
    const f = files.data?.find((x) => x.id === b.file_id);
    return (
      <figure className="draw-view">
        {f ? <div className="draw-img"><Thumb file={f} fit="contain" /></div> : <p className="small muted">Drawing</p>}
        <button type="button" className="btn btn-glass btn-sm" onClick={() => setEditing(true)}><Pencil size={13} />Edit drawing</button>
      </figure>
    );
  }
  return (
    <div className="draw-box">
      <div className="draw-tools" role="toolbar" aria-label="Drawing tools">
        {PEN_COLORS.map((c) => <button key={c} type="button" className={`draw-c${!eraser && color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => { setColor(c); setEraser(false); }} />)}
        <input type="range" min={1} max={24} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Brush size" className="draw-size" />
        <button type="button" className={`bt-btn${eraser ? ' on' : ''}`} aria-pressed={eraser} aria-label="Eraser" title="Eraser" onClick={() => setEraser((v) => !v)}><Eraser size={15} /></button>
        <button type="button" className="bt-btn" aria-label="Undo" title="Undo" onClick={() => setStrokes((x) => x.slice(0, -1))} disabled={!strokes.length}><Undo2 size={15} /></button>
        <button type="button" className="bt-btn" aria-label="Clear" title="Clear" onClick={() => setStrokes([])} disabled={!strokes.length}><Trash2 size={15} /></button>
        <span style={{ flex: 1 }} />
        {b.file_id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStrokes((b.content.strokes as Stroke[]) ?? []); setEditing(false); }}><X size={13} />Cancel</button>}
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}><Check size={13} />{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <canvas ref={cv} width={W} height={H} className="draw-canvas" style={{ aspectRatio: `${W} / ${H}` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Drawing canvas" />
    </div>
  );
}

// ── Buton ──
type BtnAction = { kind: 'tasks' | 'template'; lines: string };
function ButtonBlock({ b, onChange, projectId, insertBlocks }: ExtraProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const act = (b.content.action as BtnAction | undefined) ?? { kind: 'tasks', lines: '' };
  const [edit, setEdit] = useState(!b.content.label);
  const [label, setLabel] = useState(b.content.label ?? '');
  const [kind, setKind] = useState<BtnAction['kind']>(act.kind);
  const [lines, setLines] = useState(act.lines);
  const [busy, setBusy] = useState(false);
  async function run() {
    const items = act.lines.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!items.length) return;
    if (act.kind === 'template') { insertBlocks?.(splitLines(act.lines)); toast.ok('Template added ✦'); return; }
    setBusy(true);
    const { error } = await supabase.from('tasks').insert(items.map((title) => ({ title: title.replace(/^[-*•]\s*/, '').slice(0, 200), project_id: projectId })));
    setBusy(false);
    if (error) return toast.fail(error);
    ['tasks', 'cal', 'progress'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast.ok(`${items.length} tasks added ✦`);
  }
  if (edit) return (
    <div className="card btn-block-edit">
      <input className="input" placeholder="Button label (e.g. Start a new artwork)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Button label" />
      <div className="seg" role="group" aria-label="Button action">
        <button type="button" className={kind === 'tasks' ? 'on' : ''} onClick={() => setKind('tasks')}>Add tasks</button>
        <button type="button" className={kind === 'template' ? 'on' : ''} onClick={() => setKind('template')}>Insert template</button>
      </div>
      <textarea className="textarea" rows={4} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={kind === 'tasks' ? 'One task per line' : 'Template text · lines become blocks (# heading, - list, [ ] to do)'} aria-label="Button content" />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!label.trim() || !lines.trim()} onClick={() => { onChange({ content: { ...b.content, label: label.trim(), action: { kind, lines } } }); setEdit(false); }}><Check size={13} />Save button</button>
      </div>
    </div>
  );
  return (
    <div className="row btn-block">
      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}><Plus size={15} />{b.content.label}</button>
      <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label="Edit button" title="Edit button" onClick={() => setEdit(true)}><Pencil size={13} /></button>
    </div>
  );
}
