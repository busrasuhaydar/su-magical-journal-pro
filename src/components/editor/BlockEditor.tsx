// Akıllı blok editörü: proje sayfaları, proje dışı sayfalar ve günlük aynı editörü kullanır.
// "/" blok menüsü, Markdown kısayolları (#, ##, -, 1., [], >, ---), metin içi **kalın** / *italik* / [bağlantı](url),
// 600 ms gecikmeli otomatik kaydetme, sayfa kapanırken keepalive ile kaydetme.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, FileText, GripVertical, Heading1, Heading2, Heading3, ImagePlus, Link2, List, ListOrdered, ListTodo, Minus, Paperclip, Plus, Quote, Sparkle, Trash2, Type } from 'lucide-react';
import { addToGallery, uploadFile, useFiles, usePageBlocks, useSignedUrl, useTasks } from '../../lib/data';
import { keepaliveUpsert, supabase } from '../../lib/supabase';
import type { BlockType, FileRec, Page, PageBlock } from '../../lib/types';
import { useEditors } from '../Editors';
import { TaskRow } from '../TaskRow';
import { Dialog, useToast } from '../ui';
import { MediaSources, Thumb } from '../Media';
import { useProjectGallery } from '../../pages/project/Gallery';
import { HAS_MARKUP, renderInline } from './inline';

export type PageLite = Pick<Page, 'id' | 'title' | 'icon' | 'parent_id' | 'project_id'> & { journal_day?: string | null };
type Op = { before: PageBlock | null; after: PageBlock | null };
type PickType = 'image' | 'file' | 'task' | 'page';

const TEXT_TYPES: BlockType[] = ['text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout'];
const isText = (t: BlockType) => TEXT_TYPES.includes(t);
export const BLOCK_MENU: [BlockType, string, typeof Type, string][] = [
  ['text', 'Text', Type, 'paragraph plain'], ['h1', 'Heading 1', Heading1, 'title h1 #'], ['h2', 'Heading 2', Heading2, 'subtitle h2 ##'], ['h3', 'Heading 3', Heading3, 'h3 ###'],
  ['bullet', 'Bulleted list', List, 'bullet ul -'], ['numbered', 'Numbered list', ListOrdered, 'numbered ol 1.'], ['todo', 'To do', CheckSquare, 'todo check []'],
  ['quote', 'Quote', Quote, 'quote >'], ['callout', 'Callout', Sparkle, 'callout note'], ['divider', 'Divider', Minus, 'divider hr ---'],
  ['image', 'Image', ImagePlus, 'image photo picture gallery'], ['file', 'File', Paperclip, 'file attachment pdf'], ['link', 'Link card', Link2, 'link url bookmark'],
  ['task', 'Task', ListTodo, 'task todo'], ['page', 'Page link', FileText, 'page link subpage'],
];
// Markdown kısayolları: blok başında yazılınca blok türü değişir
const MD: [RegExp, BlockType, Partial<PageBlock['content']>?][] = [
  [/^### /, 'h3'], [/^## /, 'h2'], [/^# /, 'h1'], [/^[-*] /, 'bullet'], [/^1[.)] /, 'numbered'],
  [/^\[ ?\] /, 'todo', { checked: false }], [/^\[x\] /i, 'todo', { checked: true }], [/^> /, 'quote'],
];
const PLACEHOLDER: Partial<Record<BlockType, string>> = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'List item', numbered: 'List item', todo: 'To do', quote: 'Quote', callout: 'An important note' };

const toRow = (b: PageBlock) => ({ id: b.id, page_id: b.page_id, type: b.type, content: b.content, file_id: b.file_id, task_id: b.task_id, ref_page_id: b.ref_page_id, position: b.position });

export interface EditorApi { flush: () => void }

export function BlockEditor({ pageId, projectId, pages, onOpenPage, onOps, onText, autoStart }: {
  /** Boş sayfada ilk bloğu hemen açıp odaklar. */ autoStart?: boolean;
  pageId: string; projectId: string | null; pages: PageLite[]; onOpenPage: (id: string) => void;
  /** Her kaydedilen değişiklik (geri al/yinele ve geri bağlantılar için). */ onOps?: (ops: Op[]) => void;
  /** Bloklar değişince (içindekiler tablosu için). */ onText?: (blocks: PageBlock[]) => void;
}) {
  const q = usePageBlocks(pageId);
  const qc = useQueryClient();
  const toast = useToast();
  const [list, setListS] = useState<PageBlock[]>([]);
  const listRef = useRef<PageBlock[]>([]);
  const dirty = useRef(new Set<string>());
  const gone = useRef(new Set<string>());
  const saved = useRef(new Map<string, PageBlock>());
  const timer = useRef<number>();
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusReq = useRef<{ id: string; at: number | 'end' } | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: number; mode: 'insert' } | null>(null);
  const [slashSel, setSlashSel] = useState(0);
  const [picker, setPicker] = useState<{ type: PickType; id: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const setList = useCallback((next: PageBlock[]) => { listRef.current = next; setListS(next); onText?.(next); }, [onText]);

  // Sunucudan gelen veriyi yerel bekleyen değişikliklerle birleştir
  useEffect(() => {
    if (!q.data) return;
    for (const b of q.data) if (!dirty.current.has(b.id)) saved.current.set(b.id, b);
    const local = listRef.current.filter((b) => dirty.current.has(b.id));
    const merged = [...q.data.filter((b) => !dirty.current.has(b.id) && !gone.current.has(b.id)), ...local].sort((a, b) => a.position - b.position);
    setList(merged);
  }, [q.data, setList]);

  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current && q.data && q.data.length === 0 && listRef.current.length === 0) { started.current = true; insertAt(-1, { type: 'text' }); }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (ids: string[]) => {
    const rows = ids.map((id) => listRef.current.find((b) => b.id === id)).filter(Boolean) as PageBlock[];
    if (!rows.length) return;
    const ops: Op[] = rows.map((r) => ({ before: saved.current.get(r.id) ?? null, after: r }));
    const { error } = await supabase.from('page_blocks').upsert(rows.map(toRow), { onConflict: 'id' });
    if (error) { toast.fail(error); return; }
    for (const r of rows) {
      if (listRef.current.find((b) => b.id === r.id) === r) dirty.current.delete(r.id);
      saved.current.set(r.id, r);
    }
    onOps?.(ops);
    qc.invalidateQueries({ queryKey: ['pages'] });
  }, [toast, onOps, qc]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const ids = [...dirty.current];
    if (ids.length) void persist(ids);
  }, [persist]);
  const schedule = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600); }, [flush]);

  // Sayfa kapanırken / gizlenirken / bileşen kapanırken kaydet
  useEffect(() => {
    const unload = () => {
      const rows = [...dirty.current].map((id) => listRef.current.find((b) => b.id === id)).filter(Boolean) as PageBlock[];
      keepaliveUpsert('page_blocks', rows.map(toRow));
    };
    const vis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', unload);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', unload); window.removeEventListener('beforeunload', unload); document.removeEventListener('visibilitychange', vis); flush(); };
  }, [flush]);

  function change(id: string, patch: Partial<PageBlock>, immediate = false) {
    setList(listRef.current.map((b) => (b.id === id ? { ...b, ...patch, content: patch.content ?? b.content } : b)));
    dirty.current.add(id);
    if (immediate) flush(); else schedule();
  }
  function posBetween(i: number) { const a = listRef.current[i]?.position ?? 0, b = listRef.current[i + 1]?.position; return b == null ? a + 1 : (a + b) / 2; }
  function insertAt(i: number, partial: Partial<PageBlock>, focus: number | 'end' | null = 0) {
    const pos = i < 0 ? (listRef.current[0]?.position ?? 1) - 1 : posBetween(i);
    const b: PageBlock = { id: crypto.randomUUID(), page_id: pageId, type: 'text', content: {}, file_id: null, task_id: null, ref_page_id: null, position: pos, ...partial };
    const next = [...listRef.current, b].sort((x, y) => x.position - y.position);
    setList(next);
    dirty.current.add(b.id);
    if (focus !== null && isText(b.type)) focusReq.current = { id: b.id, at: focus };
    flush();
    return b;
  }
  async function remove(id: string) {
    const before = saved.current.get(id) ?? null;
    gone.current.add(id); dirty.current.delete(id); saved.current.delete(id);
    setList(listRef.current.filter((b) => b.id !== id));
    const { error } = await supabase.from('page_blocks').delete().eq('id', id);
    if (error) toast.fail(error); else if (before) onOps?.([{ before, after: null }]);
  }
  /** Geri al/yinele: bir bloğu verilen sürüme getirir (null = sil). */
  const applyVersion = useCallback(async (id: string, v: PageBlock | null) => {
    if (!v) { gone.current.add(id); dirty.current.delete(id); saved.current.delete(id); setList(listRef.current.filter((b) => b.id !== id)); await supabase.from('page_blocks').delete().eq('id', id); return; }
    gone.current.delete(id);
    setList([...listRef.current.filter((b) => b.id !== id), v].sort((a, b) => a.position - b.position));
    saved.current.set(id, v); dirty.current.delete(id);
    await supabase.from('page_blocks').upsert(toRow(v), { onConflict: 'id' });
  }, [setList]);
  apiRef.set(pageId, { flush, applyVersion });

  // Odak isteği (yeni blok, ok tuşları, birleştirme)
  useLayoutEffect(() => {
    const r = focusReq.current; if (!r) return;
    const el = inputs.current.get(r.id); if (!el) return;
    focusReq.current = null;
    el.focus();
    const at = r.at === 'end' ? el.value.length : r.at;
    el.setSelectionRange(at, at);
  });

  const textIdx = (from: number, dir: 1 | -1) => { for (let i = from + dir; i >= 0 && i < listRef.current.length; i += dir) if (isText(listRef.current[i].type)) return i; return -1; };

  // "/" menüsü: odaktaki metin bloğu "/sorgu" ise açılır
  const fb = list.find((b) => b.id === focused);
  const slashQ = fb && isText(fb.type) ? /^\/([\p{L}\d .]*)$/u.exec(fb.content.text ?? '')?.[1] ?? null : null;
  const slashItems = useMemo(() => (slashQ == null ? [] : BLOCK_MENU.filter(([, l, , a]) => `${l} ${a}`.toLocaleLowerCase('en').includes(slashQ.toLocaleLowerCase('en').trim()))), [slashQ]);
  useEffect(() => setSlashSel(0), [slashQ]);

  function choose(type: BlockType, id: string) {
    setMenu(null);
    if (type === 'image' || type === 'file' || type === 'task' || type === 'page') { setPicker({ type, id }); return; }
    const i = listRef.current.findIndex((b) => b.id === id);
    if (type === 'divider') { change(id, { type: 'divider', content: {} }, true); insertAt(i, { type: 'text' }); return; }
    if (type === 'link') { change(id, { type: 'link', content: {} }, true); return; }
    change(id, { type, content: { text: '', ...(type === 'todo' ? { checked: false } : {}) } }, true);
    focusReq.current = { id, at: 0 };
  }
  /** "+" menüsünden: altına yeni blok ekle, sonra türünü seç. */
  function chooseInsert(type: BlockType, at: number) {
    const b = insertAt(at, { type: isText(type) ? type : 'text', content: type === 'todo' ? { text: '', checked: false } : {} }, isText(type) ? 0 : null);
    if (!isText(type)) choose(type, b.id);
  }

  function onTextChange(b: PageBlock, text: string) {
    if (b.type === 'text') {
      if (text === '---' || text === '***') { const i = listRef.current.findIndex((x) => x.id === b.id); change(b.id, { type: 'divider', content: {} }, true); insertAt(i, { type: 'text' }); return; }
      for (const [re, type, extra] of MD) {
        if (re.test(text) && !re.test(b.content.text ?? '')) { change(b.id, { type, content: { ...extra, text: text.replace(re, '') } }); focusReq.current = { id: b.id, at: 0 }; return; }
      }
    }
    change(b.id, { content: { ...b.content, text } });
  }

  function wrap(el: HTMLTextAreaElement, b: PageBlock, left: string, right: string, placeholder: string) {
    const s = el.selectionStart, e = el.selectionEnd, v = el.value;
    const inner = v.slice(s, e) || placeholder;
    change(b.id, { content: { ...b.content, text: v.slice(0, s) + left + inner + right + v.slice(e) } });
    focusReq.current = { id: b.id, at: s + left.length + inner.length };
  }

  function onKey(e: RKE<HTMLTextAreaElement>, b: PageBlock, i: number) {
    const el = e.currentTarget, text = el.value, s = el.selectionStart, en = el.selectionEnd, mod = e.metaKey || e.ctrlKey;
    if (slashItems.length && b.id === focused) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSel((x) => Math.min(x + 1, slashItems.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSel((x) => Math.max(x - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); choose(slashItems[slashSel][0], b.id); return; }
      if (e.key === 'Escape') { e.preventDefault(); change(b.id, { content: { ...b.content, text: '' } }); return; }
    }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap(el, b, '**', '**', 'bold'); return; }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap(el, b, '*', '*', 'italic'); return; }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); wrap(el, b, '[', '](https://)', 'link'); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (['bullet', 'numbered', 'todo', 'quote', 'callout'].includes(b.type) && !text) { change(b.id, { type: 'text' }, true); return; }
      const before = text.slice(0, s), after = text.slice(en);
      if (after !== '' || before !== text) change(b.id, { content: { ...b.content, text: before } });
      const nextType: BlockType = ['bullet', 'numbered', 'todo'].includes(b.type) ? b.type : 'text';
      insertAt(i, { type: nextType, content: { text: after, ...(nextType === 'todo' ? { checked: false } : {}) } }, 0);
      return;
    }
    if (e.key === 'Backspace' && s === 0 && en === 0) {
      if (b.type !== 'text') { e.preventDefault(); change(b.id, { type: 'text' }, true); return; }
      const p = textIdx(i, -1);
      if (!text) { e.preventDefault(); if (p >= 0) focusReq.current = { id: listRef.current[p].id, at: 'end' }; void remove(b.id); return; }
      if (p >= 0 && p === i - 1) {
        e.preventDefault();
        const prev = listRef.current[p], pt = prev.content.text ?? '';
        change(prev.id, { content: { ...prev.content, text: pt + text } }, true);
        focusReq.current = { id: prev.id, at: pt.length };
        void remove(b.id);
      }
      return;
    }
    if (e.key === 'ArrowUp' && !text.slice(0, s).includes('\n')) { const p = textIdx(i, -1); if (p >= 0) { e.preventDefault(); focusReq.current = { id: listRef.current[p].id, at: 'end' }; setFocused(listRef.current[p].id); } return; }
    if (e.key === 'ArrowDown' && !text.slice(en).includes('\n')) { const n = textIdx(i, 1); if (n >= 0) { e.preventDefault(); focusReq.current = { id: listRef.current[n].id, at: 0 }; setFocused(listRef.current[n].id); } }
  }

  async function dropOn(targetIdx: number) {
    if (!dragId) return;
    const l = listRef.current, from = l.findIndex((b) => b.id === dragId);
    setDragId(null);
    if (from < 0 || from === targetIdx) return;
    const before = targetIdx > from ? l[targetIdx]?.position : l[targetIdx - 1]?.position ?? (l[0].position - 1);
    const after = targetIdx > from ? l[targetIdx + 1]?.position ?? l[targetIdx].position + 1 : l[targetIdx].position;
    change(dragId, { position: (before + after) / 2 }, true);
    setList([...listRef.current].sort((a, b) => a.position - b.position));
  }

  let num = 0;
  return (
    <div className="blocks">
      {list.length === 0 && !q.isLoading && <button type="button" className="block-empty" onClick={() => insertAt(-1, { type: 'text' })}><Type size={14} /> Click to start writing · type “/” for blocks</button>}
      {list.map((b, i) => {
        num = b.type === 'numbered' ? num + 1 : 0;
        return (
          <div key={b.id} id={`blk-${b.id}`} className={`block-row${dragId === b.id ? ' dragging' : ''}`} onDragOver={(e) => dragId && e.preventDefault()} onDrop={() => dropOn(i)}>
            <div className="block-gutter">
              <button type="button" className="bg-btn" onClick={() => setMenu(menu?.at === i ? null : { at: i, mode: 'insert' })} aria-label="Add block below"><Plus size={14} /></button>
              <span className="bg-btn" draggable onDragStart={() => setDragId(b.id)} onDragEnd={() => setDragId(null)} aria-label="Drag" role="button" tabIndex={-1}><GripVertical size={14} /></span>
            </div>
            <div className="block-body">
              {isText(b.type)
                ? <TextBlock b={b} n={num} onOpenPage={onOpenPage}
                    register={(el) => { if (el) inputs.current.set(b.id, el); else inputs.current.delete(b.id); }}
                    onChange={(t) => onTextChange(b, t)} onKeyDown={(e) => onKey(e, b, i)}
                    onFocus={() => setFocused(b.id)} onBlur={() => { flush(); setTimeout(() => setFocused((f) => (f === b.id ? null : f)), 150); }}
                    onCheck={(c) => change(b.id, { content: { ...b.content, checked: c } }, true)} />
                : <MediaBlock b={b} projectId={projectId} onChange={(patch) => change(b.id, patch, true)} onOpenPage={onOpenPage} />}
            </div>
            <button type="button" className="bg-btn del" onClick={() => remove(b.id)} aria-label="Delete block"><Trash2 size={13} /></button>
            {slashItems.length > 0 && focused === b.id && (
              <div className="block-menu" role="listbox" aria-label="Blocks">
                {slashItems.map(([t, l, I], k) => <button type="button" key={t} role="option" aria-selected={k === slashSel} className={k === slashSel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); choose(t, b.id); }}><I size={15} />{l}</button>)}
              </div>
            )}
            {menu?.at === i && <BlockMenu onPick={(t) => chooseInsert(t, i)} onClose={() => setMenu(null)} />}
          </div>
        );
      })}
      {list.length > 0 && <button type="button" className="btn btn-ghost btn-sm block-add" onClick={() => insertAt(list.length - 1, { type: 'text' })}><Plus size={13} />Add block</button>}
      {picker && <Picker projectId={projectId} type={picker.type} pageId={pageId} pages={pages} onClose={() => setPicker(null)}
        onPick={(extra) => { change(picker.id, { type: picker.type, content: {}, ...extra }, true); setPicker(null); }} />}
    </div>
  );
}

// Sayfa düzeyinde erişim (geri al/yinele, geçmişten geri yükleme)
export const apiRef = new Map<string, { flush: () => void; applyVersion: (id: string, v: PageBlock | null) => Promise<void> }>();

function BlockMenu({ onPick, onClose }: { onPick: (t: BlockType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', h));
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [onClose]);
  return (
    <div className="block-menu" ref={ref} role="menu">
      {BLOCK_MENU.map(([t, l, I]) => <button type="button" key={t} role="menuitem" onClick={() => onPick(t)}><I size={15} />{l}</button>)}
    </div>
  );
}

/** Metin bloğu: düzenlerken textarea, değilken biçimli önizleme (biçim işareti varsa). */
function TextBlock({ b, n, register, onChange, onKeyDown, onFocus, onBlur, onCheck, onOpenPage }: {
  b: PageBlock; n: number; register: (el: HTMLTextAreaElement | null) => void; onChange: (t: string) => void;
  onKeyDown: (e: RKE<HTMLTextAreaElement>) => void; onFocus: () => void; onBlur: () => void; onCheck: (c: boolean) => void; onOpenPage: (id: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [editing, setEditing] = useState(false);
  const text = b.content.text ?? '';
  const preview = !editing && HAS_MARKUP.test(text);
  useLayoutEffect(() => { const el = ref.current; if (el && !preview) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [text, preview, b.type]);
  const cls = `block-text ${['h1', 'h2', 'h3'].includes(b.type) ? b.type : ''} ${b.type === 'todo' && b.content.checked ? 'checked' : ''}`;
  const field = (
    <div className={`rt${preview ? ' rt-prev' : ''}`}>
      {preview && <div className={cls} onClick={() => { ref.current?.focus(); }}>{renderInline(text, onOpenPage)}</div>}
      <textarea ref={(el) => { ref.current = el; register(el); }} rows={1} className={cls} value={text} placeholder={PLACEHOLDER[b.type] ?? 'Type “/” for blocks…'}
        aria-label={PLACEHOLDER[b.type] ?? 'Text'} tabIndex={preview ? -1 : 0}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => { setEditing(true); onFocus(); }} onBlur={() => { setEditing(false); onBlur(); }} />
    </div>
  );
  switch (b.type) {
    case 'bullet': return <div className="li"><span className="li-mark">•</span>{field}</div>;
    case 'numbered': return <div className="li"><span className="li-mark">{n}.</span>{field}</div>;
    case 'todo': return <div className="li"><input id={`td-${b.id}`} type="checkbox" checked={!!b.content.checked} onChange={(e) => onCheck(e.target.checked)} style={{ marginTop: 7 }} aria-label="Done" />{field}</div>;
    case 'quote': return <div className="quote">{field}</div>;
    case 'callout': return <div className="callout"><span>✦</span>{field}</div>;
    default: return field;
  }
}

function MediaBlock({ b, projectId, onChange, onOpenPage }: { b: PageBlock; projectId: string | null; onChange: (patch: Partial<PageBlock>) => void; onOpenPage: (id: string) => void }) {
  const tasks = useTasks();
  const files = useFiles();
  void projectId;
  switch (b.type) {
    case 'divider': return <hr className="divider" />;
    case 'link': return <LinkBlock b={b} onChange={onChange} />;
    case 'image': {
      const f = files.data?.find((x) => x.id === b.file_id);
      return f ? <figure className="img-block"><div><Thumb file={f} fit="contain" /></div><figcaption>{b.content.caption || f.title}</figcaption></figure> : <p className="small muted">{files.isLoading ? 'Loading…' : 'The image was removed.'}</p>;
    }
    case 'file': return <FileBlock file={files.data?.find((x) => x.id === b.file_id)} />;
    case 'task': {
      const t = tasks.data?.find((x) => x.id === b.task_id);
      return t ? <TaskRow task={t} /> : <p className="small muted">The task was deleted.</p>;
    }
    case 'page': return b.ref_page_id ? <button type="button" className="page-link" onClick={() => onOpenPage(b.ref_page_id!)}><FileText size={14} />{b.content.title ?? 'Page'}</button> : null;
    default: return null;
  }
}

function LinkBlock({ b, onChange }: { b: PageBlock; onChange: (patch: Partial<PageBlock>) => void }) {
  const [edit, setEdit] = useState(!b.content.url);
  const [url, setUrl] = useState(b.content.url ?? '');
  const [title, setTitle] = useState(b.content.title ?? '');
  if (edit) return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); let u = url.trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { new URL(u); } catch { return; } onChange({ content: { url: u, title: title.trim() || new URL(u).hostname } }); setEdit(false); }}>
      <input id={`lb-t-${b.id}`} className="input" style={{ flex: '1 1 140px', width: 'auto' }} placeholder="Name" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input id={`lb-u-${b.id}`} className="input" style={{ flex: '2 1 200px', width: 'auto' }} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      <button className="btn btn-primary btn-sm"><Plus size={13} />Add</button>
    </form>
  );
  return <a className="card link-card" href={b.content.url} target="_blank" rel="noopener noreferrer" onDoubleClick={(e) => { e.preventDefault(); setEdit(true); }}><Link2 size={16} /><div><b>{b.content.title}</b><div className="small muted">{b.content.url && new URL(b.content.url).hostname}</div></div></a>;
}

function FileBlock({ file }: { file?: FileRec }) {
  const u = useSignedUrl(file?.storage_path);
  if (!file) return <p className="small muted">File not found.</p>;
  return <a className="card link-card" href={u.data} target="_blank" rel="noopener noreferrer"><Paperclip size={16} /><b>{file.title}</b></a>;
}

function Picker({ projectId, type, pageId, pages, onClose, onPick }: { projectId: string | null; type: PickType; pageId: string; pages: PageLite[]; onClose: () => void; onPick: (extra: Partial<PageBlock>) => void }) {
  const gallery = useProjectGallery(projectId ?? '');
  const files = useFiles();
  const tasks = useTasks();
  const qc = useQueryClient();
  const toast = useToast();
  const { openTask } = useEditors();
  const [busy, setBusy] = useState(false);
  const all = projectId ? gallery.map((g) => g.file) : (files.data ?? []);
  const pool = type === 'image' ? all.filter((f) => f.mime.startsWith('image/') || f.mime.startsWith('video/')) : all;
  async function upload(input: File[] | FileRec[]) {
    if (!input.length) return; setBusy(true);
    try {
      const first = input[0]; const rec = first instanceof File ? (await uploadFile(first)).rec : first;
      if (projectId) await addToGallery(rec.id, projectId);
      qc.invalidateQueries({ queryKey: ['files'] }); onPick({ file_id: rec.id });
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  const title = { image: 'Choose an image', file: 'Choose a file', task: 'Choose a task', page: 'Choose a page' }[type];
  return (
    <Dialog title={title} onClose={onClose} wide>
      {(type === 'image' || type === 'file') && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <MediaSources id="pk-in" busy={busy} multiple={false} visualOnly={type === 'image'} accept={type === 'image' ? 'image/*,video/*' : undefined} onFiles={upload} onPicked={upload} />
            {projectId && <span className="small muted">The file you choose is also added to the project’s gallery.</span>}
          </div>
          {pool.length === 0 ? <p className="small muted">No suitable files yet.</p> : (
            <div className="pgal">{pool.slice(0, 120).map((f) => <figure key={f.id} className="pgal-item" onClick={() => onPick({ file_id: f.id })}><div className="pgal-img"><Thumb file={f} /></div><figcaption>{f.title}</figcaption></figure>)}</div>
          )}
        </>
      )}
      {type === 'task' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className="btn btn-glass btn-sm" style={{ justifySelf: 'start' }} onClick={() => { onClose(); openTask({ project_id: projectId }); }}><Plus size={13} />Create new task (then choose it here)</button>
          <div className="task-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {(tasks.data ?? []).filter((t) => t.status !== 'cancelled').sort((a, b) => (a.project_id === projectId ? -1 : 0) - (b.project_id === projectId ? -1 : 0)).map((t) => (
              <button type="button" key={t.id} className="task-row" style={{ textAlign: 'left', border: '1px solid var(--glass-edge)' }} onClick={() => onPick({ task_id: t.id })}><div className="t"><b>{t.title}</b><div className="meta">{projectId && t.project_id === projectId ? 'This project' : 'Other project / general'}</div></div></button>
            ))}
          </div>
        </div>
      )}
      {type === 'page' && (
        <div className="task-list">{pages.filter((x) => x.id !== pageId && !x.journal_day).map((x) => <button type="button" key={x.id} className="task-row" style={{ textAlign: 'left', border: '1px solid var(--glass-edge)' }} onClick={() => onPick({ ref_page_id: x.id, content: { title: `${x.icon ?? ''} ${x.title}`.trim() } })}><b>{x.icon} {x.title}</b></button>)}</div>
      )}
    </Dialog>
  );
}
