// Akıllı blok editörü: proje sayfaları, proje dışı sayfalar ve günlük aynı editörü kullanır.
// "/" ve "+" menüsü (son kullanılanlar, hazır düzenler), Markdown kısayolları, metin içi biçim, kristal blok araç çubuğu,
// seçince biçim balonu, çoklu seçim, sütunlar ("yan yana koy"), dnd-kit sürükleme (parlayan bırakma çizgisi), akıllı yapıştırma,
// 600 ms gecikmeli otomatik kaydetme, sayfa kapanırken keepalive ile kaydetme.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as RCE, type KeyboardEvent as RKE, type ReactNode, type TouchEvent as RTE } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { CheckSquare, Code2, FileText, GripVertical, Heading1, Heading2, Heading3, ImagePlus, Link2, List, ListChecks, ListOrdered, ListTodo, Minus, Paperclip, Plus, Quote, Sparkle, Trash2, Type, X, Copy, Palette, Repeat2, CalendarClock } from 'lucide-react';
import { addToGallery, uploadFile, useFiles, usePageBlocks, useProfile, useSignedUrl, useTasks } from '../../lib/data';
import { keepaliveUpsert, supabase } from '../../lib/supabase';
import type { BlockType, FileRec, Page, PageBlock } from '../../lib/types';
import { usePrefsWriter } from '../../lib/ui';
import { useEditors } from '../Editors';
import { TaskRow } from '../TaskRow';
import { Dialog, useToast } from '../ui';
import { MediaSources, Thumb } from '../Media';
import { useProjectGallery } from '../../pages/project/Gallery';
import { HAS_MARKUP, PAGE_TOKEN, renderInline } from './inline';
import { BG_COLORS, BlockTools, EmbedBlock, FormatBubble, PasteChoice, PlusMenu, TEXT_COLORS, splitLines, type Fmt, type Preset } from './blockParts';
import { parseDateText, type ParsedDate } from '../../lib/dateParse';
import { toInstant } from '../../lib/dates';
import { EXTRA_BLOCKS, ExtraBlock, extraSlash, type ExtraProps } from './extraBlocks';

export type PageLite = Pick<Page, 'id' | 'title' | 'icon' | 'parent_id' | 'project_id'> & { journal_day?: string | null };
export type Op = { before: PageBlock | null; after: PageBlock | null };
type PickType = 'image' | 'file' | 'task' | 'page';
type DropPos = 'before' | 'after' | 'left' | 'right';

const TEXT_TYPES: BlockType[] = ['text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout'];
const isText = (t: BlockType) => TEXT_TYPES.includes(t);
export const BLOCK_MENU: [BlockType, string, typeof Type, string][] = [
  ['text', 'Text', Type, 'paragraph plain'], ['h1', 'Heading 1', Heading1, 'title h1 #'], ['h2', 'Heading 2', Heading2, 'subtitle h2 ##'], ['h3', 'Heading 3', Heading3, 'h3 ###'],
  ['bullet', 'Bulleted list', List, 'bullet ul -'], ['numbered', 'Numbered list', ListOrdered, 'numbered ol 1.'], ['todo', 'To do', CheckSquare, 'todo check []'],
  ['quote', 'Quote', Quote, 'quote >'], ['callout', 'Callout', Sparkle, 'callout note'], ['divider', 'Divider', Minus, 'divider hr ---'],
  ['image', 'Image', ImagePlus, 'image photo picture gallery'], ['file', 'File', Paperclip, 'file attachment pdf'], ['link', 'Link card', Link2, 'link url bookmark'],
  ['embed', 'Embed', Code2, 'embed video youtube spotify iframe'],
  ['task', 'Task', ListTodo, 'task todo'], ['page', 'Page link', FileText, 'page link subpage'],
  ...EXTRA_BLOCKS,
];
const MD: [RegExp, BlockType, Partial<PageBlock['content']>?][] = [
  [/^### /, 'h3'], [/^## /, 'h2'], [/^# /, 'h1'], [/^[-*] /, 'bullet'], [/^1[.)] /, 'numbered'],
  [/^\[ ?\] /, 'todo', { checked: false }], [/^\[x\] /i, 'todo', { checked: true }], [/^> /, 'quote'],
];
const PLACEHOLDER: Partial<Record<BlockType, string>> = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'List item', numbered: 'List item', todo: 'To do', quote: 'Quote', callout: 'An important note' };

const toRow = (b: PageBlock) => ({ id: b.id, page_id: b.page_id, type: b.type, content: b.content, file_id: b.file_id, task_id: b.task_id, ref_page_id: b.ref_page_id, position: b.position });
const uid = () => crypto.randomUUID();

export function BlockEditor({ pageId, projectId, pages, onOpenPage, onOps, onText, autoStart }: {
  /** Boş sayfada ilk bloğu hemen açıp odaklar. */ autoStart?: boolean;
  pageId: string; projectId: string | null; pages: PageLite[]; onOpenPage: (id: string) => void;
  /** Her kaydedilen değişiklik (geri al/yinele ve geri bağlantılar için). */ onOps?: (ops: Op[]) => void;
  /** Bloklar değişince (içindekiler tablosu için). */ onText?: (blocks: PageBlock[]) => void;
}) {
  const q = usePageBlocks(pageId);
  const qc = useQueryClient();
  const toast = useToast();
  const recent = (useProfile().data?.ui_prefs?.recent_blocks ?? []) as BlockType[];
  const writePrefs = usePrefsWriter();
  const [list, setListS] = useState<PageBlock[]>([]);
  const listRef = useRef<PageBlock[]>([]);
  const dirty = useRef(new Set<string>());
  const gone = useRef(new Set<string>());
  const saved = useRef(new Map<string, PageBlock>());
  const timer = useRef<number>();
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusReq = useRef<{ id: string; at: number | 'end'; end?: number } | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: number } | null>(null);
  const [slashSel, setSlashSel] = useState(0);
  const [picker, setPicker] = useState<{ type: PickType; id: string } | null>(null);
  const [mention, setMention] = useState<{ id: string; start: number; end: number; q: string } | null>(null);
  const [mentionSel, setMentionSel] = useState(0);
  const [selRange, setSelRange] = useState<{ id: string; s: number; e: number } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [paste, setPaste] = useState<{ id: string; i: number; url: string; s: number; e: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);
  const mentionIds = useRef<Set<string> | null>(null);
  const [dateSug, setDateSug] = useState<{ id: string; start: number; end: number; p: ParsedDate } | null>(null);
  /** "@yarın 10:00" → tarih çipi + hatırlatmalı görev (reminders). */
  async function acceptDate() {
    const d = dateSug; setDateSug(null); if (!d) return;
    const b = listRef.current.find((x) => x.id === d.id); if (!b) return;
    const v = b.content.text ?? '';
    const iso = d.p.time ? `${d.p.day} ${d.p.time}` : d.p.day;
    const token = `{d:${iso}|${d.p.label}} `;
    const text = v.slice(0, d.start) + token + v.slice(d.end);
    change(b.id, { content: { ...b.content, text } }, true);
    focusReq.current = { id: b.id, at: d.start + token.length };
    const title = text.replace(/\{d:[^}]*\}/g, '').replace(/\[\[page:[^|\]]+\|([^\]]*)\]\]/g, '$1').replace(/[*_~=`]/g, '').trim().slice(0, 200) || 'Reminder';
    try {
      const at = toInstant(d.p.day, d.p.time ? Number(d.p.time.slice(0, 2)) * 60 + Number(d.p.time.slice(3)) : 9 * 60);
      const ins = await supabase.from('tasks').insert({ title, due_date: d.p.day, project_id: projectId, ...(d.p.time ? { starts_at: at, ends_at: new Date(new Date(at).getTime() + 30 * 60000).toISOString() } : {}) }).select('id').single();
      if (ins.error) throw ins.error;
      const r = await supabase.from('reminders').insert({ task_id: ins.data.id, remind_at: at, label: 'From a page' });
      if (r.error) throw r.error;
      ['tasks', 'cal', 'reminders'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.ok(`Reminder set · ${d.p.label}`);
    } catch (x) { toast.fail(x); }
  }

  const setList = useCallback((next: PageBlock[]) => { listRef.current = next; setListS(next); onText?.(next); }, [onText]);

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
    void syncMentions();
  }, [toast, onOps, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  async function syncMentions() {
    const want = new Set<string>();
    for (const b of listRef.current) for (const m of (b.content.text ?? '').matchAll(PAGE_TOKEN)) if (m[1] !== pageId) want.add(m[1]);
    if (!mentionIds.current) {
      const { data } = await supabase.from('entity_links').select('to_id').eq('from_type', 'page_mention').eq('from_id', pageId).eq('to_type', 'page');
      mentionIds.current = new Set((data ?? []).map((r) => r.to_id as string));
    }
    const have = mentionIds.current;
    const add = [...want].filter((x) => !have.has(x)), del = [...have].filter((x) => !want.has(x));
    if (!add.length && !del.length) return;
    mentionIds.current = want;
    if (add.length) await supabase.from('entity_links').insert(add.map((to_id) => ({ from_type: 'page_mention', from_id: pageId, to_type: 'page', to_id })));
    if (del.length) await supabase.from('entity_links').delete().eq('from_type', 'page_mention').eq('from_id', pageId).eq('to_type', 'page').in('to_id', del);
    qc.invalidateQueries({ queryKey: ['links'] });
  }

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const ids = [...dirty.current];
    if (ids.length) await persist(ids);
  }, [persist]);
  const schedule = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 600); }, [flush]);

  useEffect(() => {
    const unload = () => {
      const rows = [...dirty.current].map((id) => listRef.current.find((b) => b.id === id)).filter(Boolean) as PageBlock[];
      keepaliveUpsert('page_blocks', rows.map(toRow));
    };
    const vis = () => { if (document.visibilityState === 'hidden') void flush(); };
    window.addEventListener('pagehide', unload);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', unload); window.removeEventListener('beforeunload', unload); document.removeEventListener('visibilitychange', vis); void flush(); };
  }, [flush]);

  function change(id: string, patch: Partial<PageBlock>, immediate = false) {
    setList(listRef.current.map((b) => (b.id === id ? { ...b, ...patch, content: patch.content ?? b.content } : b)));
    dirty.current.add(id);
    if (immediate) void flush(); else schedule();
  }
  const patchContent = (id: string, c: Partial<PageBlock['content']>, immediate = true) => { const b = listRef.current.find((x) => x.id === id); if (b) change(id, { content: { ...b.content, ...c } }, immediate); };
  function posBetween(i: number) { const a = listRef.current[i]?.position ?? 0, b = listRef.current[i + 1]?.position; return b == null ? a + 1 : (a + b) / 2; }
  function insertAt(i: number, partial: Partial<PageBlock>, focus: number | 'end' | null = 0) {
    const pos = i < 0 ? (listRef.current[0]?.position ?? 1) - 1 : posBetween(i);
    const b: PageBlock = { id: uid(), page_id: pageId, type: 'text', content: {}, file_id: null, task_id: null, ref_page_id: null, position: pos, ...partial };
    const next = [...listRef.current, b].sort((x, y) => x.position - y.position);
    setList(next);
    dirty.current.add(b.id);
    if (focus !== null && isText(b.type)) focusReq.current = { id: b.id, at: focus };
    void flush();
    return b;
  }
  /** Bir satırda tek sütun kaldıysa satırı çöz. */
  function normalizeRows() {
    const byRow = new Map<string, PageBlock[]>();
    listRef.current.forEach((b) => { const r = b.content.row; if (r) byRow.set(r, [...(byRow.get(r) ?? []), b]); });
    byRow.forEach((bs) => {
      const cols = [...new Set(bs.map((b) => b.content.col ?? 0))].sort((a, b) => a - b);
      if (cols.length < 2) bs.forEach((b) => { const { row: _r, col: _c, ...rest } = b.content; void _r; void _c; change(b.id, { content: rest }, true); });
      else bs.forEach((b) => { const ci = cols.indexOf(b.content.col ?? 0); if (ci !== b.content.col) change(b.id, { content: { ...b.content, col: ci } }, true); });
    });
  }
  async function remove(id: string) {
    const before = saved.current.get(id) ?? null;
    gone.current.add(id); dirty.current.delete(id); saved.current.delete(id);
    setList(listRef.current.filter((b) => b.id !== id));
    normalizeRows();
    const { error } = await supabase.from('page_blocks').delete().eq('id', id);
    if (error) toast.fail(error); else { if (before) onOps?.([{ before, after: null }]); void syncMentions(); }
  }
  const applyVersion = useCallback(async (id: string, v: PageBlock | null) => {
    if (!v) { gone.current.add(id); dirty.current.delete(id); saved.current.delete(id); setList(listRef.current.filter((b) => b.id !== id)); await supabase.from('page_blocks').delete().eq('id', id); return; }
    gone.current.delete(id);
    setList([...listRef.current.filter((b) => b.id !== id), v].sort((a, b) => a.position - b.position));
    saved.current.set(id, v); dirty.current.delete(id);
    await supabase.from('page_blocks').upsert(toRow(v), { onConflict: 'id' });
  }, [setList]);
  apiRef.set(pageId, { flush, applyVersion });

  useLayoutEffect(() => {
    const r = focusReq.current; if (!r) return;
    const el = inputs.current.get(r.id); if (!el) return;
    focusReq.current = null;
    el.focus();
    const at = r.at === 'end' ? el.value.length : r.at;
    el.setSelectionRange(at, r.end ?? at);
  });

  const textIdx = (from: number, dir: 1 | -1) => { for (let i = from + dir; i >= 0 && i < listRef.current.length; i += dir) if (isText(listRef.current[i].type)) return i; return -1; };

  const fb = list.find((b) => b.id === focused);
  const slashQ = fb && isText(fb.type) ? /^\/([\p{L}\d .]*)$/u.exec(fb.content.text ?? '')?.[1] ?? null : null;
  const slashItems = useMemo(() => (slashQ == null ? [] : BLOCK_MENU.filter(([, l, , a]) => `${l} ${a}`.toLocaleLowerCase('en').includes(slashQ.toLocaleLowerCase('en').trim()))), [slashQ]);
  useEffect(() => setSlashSel(0), [slashQ]);

  const mentionItems = useMemo(() => {
    if (!mention) return [];
    const n = mention.q.toLocaleLowerCase('en');
    return pages.filter((p) => p.id !== pageId && !p.journal_day && p.title.toLocaleLowerCase('en').includes(n)).slice(0, 8);
  }, [mention, pages, pageId]);
  useEffect(() => setMentionSel(0), [mention?.q]);
  async function pickMention(target: PageLite | 'new') {
    if (!mention) return;
    const b = listRef.current.find((x) => x.id === mention.id); if (!b) return;
    let pg: PageLite;
    if (target === 'new') {
      const title = mention.q.trim() || 'Untitled page';
      const { data, error } = await supabase.from('pages').insert({ title, icon: '📄', project_id: projectId, parent_id: null, position: Date.now() / 1e6 }).select().single();
      if (error) { toast.fail(error); return; }
      pg = data as PageLite; qc.invalidateQueries({ queryKey: ['pages'] });
    } else pg = target;
    const text = b.content.text ?? '';
    const token = `[[page:${pg.id}|${pg.title.replace(/[\]|]/g, '')}]] `;
    change(b.id, { content: { ...b.content, text: text.slice(0, mention.start) + token + text.slice(mention.end) } }, true);
    focusReq.current = { id: b.id, at: mention.start + token.length };
    setMention(null);
  }

  const remember = (t: BlockType) => writePrefs((u) => ({ ...u, recent_blocks: [t, ...((u.recent_blocks ?? []) as string[]).filter((x) => x !== t)].slice(0, 5) }));
  function choose(type: BlockType, id: string) {
    setMenu(null);
    remember(type);
    if (type === 'image' || type === 'file' || type === 'task' || type === 'page') { setPicker({ type, id }); return; }
    const i = listRef.current.findIndex((b) => b.id === id);
    const cur = listRef.current[i];
    const keep = { indent: cur?.content.indent, row: cur?.content.row, col: cur?.content.col };
    if (type === 'divider') { change(id, { type: 'divider', content: { ...keep } }, true); insertAt(i, { type: 'text', content: { row: keep.row, col: keep.col } }); return; }
    if (type === 'link' || type === 'embed') { change(id, { type, content: { ...keep } }, true); return; }
    const extra = extraSlash(type);
    if (extra) { change(id, { type, content: { ...keep, ...extra } }, true); return; }
    change(id, { type, content: { ...keep, text: '', ...(type === 'todo' ? { checked: false } : {}) } }, true);
    focusReq.current = { id, at: 0 };
  }
  /** Araç çubuğundan dönüştür: metin korunur. */
  function transform(id: string, type: BlockType) {
    const b = listRef.current.find((x) => x.id === id); if (!b) return;
    if (isText(type) && isText(b.type)) { change(id, { type, content: { ...b.content, ...(type === 'todo' && b.content.checked == null ? { checked: false } : {}) } }, true); remember(type); return; }
    choose(type, id);
  }
  function chooseInsert(type: BlockType, at: number) {
    const ref = listRef.current[at];
    const b = insertAt(at, { type: isText(type) ? type : 'text', content: { ...(type === 'todo' ? { text: '', checked: false } : {}), row: ref?.content.row, col: ref?.content.col } }, isText(type) ? 0 : null);
    remember(type);
    if (!isText(type)) choose(type, b.id);
    setMenu(null);
  }
  function preset(p: Preset, at: number) {
    setMenu(null);
    const row = uid();
    const add = (k: number, partial: Partial<PageBlock>, col: number) => insertAt(at + k, { ...partial, content: { ...(partial.content ?? {}), row, col } }, null);
    if (p === 'cols2' || p === 'cols3') { const n = p === 'cols2' ? 2 : 3; const first = add(0, { type: 'text' }, 0); for (let k = 1; k < n; k++) add(k, { type: 'text' }, k); focusReq.current = { id: first.id, at: 0 }; return; }
    if (p === 'imgtext') { add(0, { type: 'image' }, 0); const t = add(1, { type: 'text' }, 1); focusReq.current = { id: t.id, at: 0 }; return; }
    if (p === 'gallery') { for (let k = 0; k < 3; k++) add(k, { type: 'image' }, k); return; }
    for (let k = 0; k < 3; k++) add(k, { type: 'callout', content: { text: '' } }, k);
  }

  function onTextChange(b: PageBlock, text: string, caret = text.length) {
    const m = /\[\[([^\]\n[]{0,40})$/.exec(text.slice(0, caret));
    setMention(m ? { id: b.id, start: caret - m[0].length, end: caret, q: m[1] } : null);
    if (b.type === 'text') {
      if (text === '---' || text === '***') { const i = listRef.current.findIndex((x) => x.id === b.id); change(b.id, { type: 'divider', content: {} }, true); insertAt(i, { type: 'text' }); return; }
      for (const [re, type, extra] of MD) {
        if (re.test(text) && !re.test(b.content.text ?? '')) { change(b.id, { type, content: { ...b.content, ...extra, text: text.replace(re, '') } }); focusReq.current = { id: b.id, at: 0 }; return; }
      }
    }
    const dm = /(^|\s)@([^@\n]{2,32})$/.exec(text.slice(0, caret));
    const pd = dm ? parseDateText(dm[2]) : null;
    setDateSug(pd && dm ? { id: b.id, start: caret - dm[2].length - 1, end: caret, p: pd } : null);
    change(b.id, { content: { ...b.content, text } });
  }

  function wrap(el: HTMLTextAreaElement, b: PageBlock, left: string, right: string, placeholder: string) {
    const s = el.selectionStart, e = el.selectionEnd, v = el.value;
    const inner = v.slice(s, e) || placeholder;
    change(b.id, { content: { ...b.content, text: v.slice(0, s) + left + inner + right + v.slice(e) } });
    focusReq.current = { id: b.id, at: s + left.length, end: s + left.length + inner.length };
  }
  function format(f: Fmt) {
    if (!selRange) return;
    const b = listRef.current.find((x) => x.id === selRange.id); const el = inputs.current.get(selRange.id);
    if (!b || !el) return;
    el.setSelectionRange(selRange.s, selRange.e);
    if (f === 'b') wrap(el, b, '**', '**', 'bold');
    else if (f === 'i') wrap(el, b, '*', '*', 'italic');
    else if (f === 'u') wrap(el, b, '__', '__', 'underline');
    else if (f === 's') wrap(el, b, '~~', '~~', 'strike');
    else if (f === 'link') wrap(el, b, '[', '](https://)', 'link');
    else if (f === 'mention' || f === 'page') {
      const v = el.value, sel = v.slice(selRange.s, selRange.e).replace(/[\]\n[]/g, '');
      const text = v.slice(0, selRange.s) + '[[' + sel + v.slice(selRange.e);
      change(b.id, { content: { ...b.content, text } });
      const caret = selRange.s + 2 + sel.length;
      setMention({ id: b.id, start: selRange.s, end: caret, q: sel });
      focusReq.current = { id: b.id, at: caret };
    } else if ('color' in f) wrap(el, b, `{c:${f.color}|`, '}', 'text');
    else wrap(el, b, `{h:${f.hl}|`, '}', 'text');
    setSelRange(null);
  }

  function indent(id: string, d: 1 | -1) { const b = listRef.current.find((x) => x.id === id); if (b) patchContent(id, { indent: Math.max(0, Math.min(4, (b.content.indent ?? 0) + d)) }); }
  function move(id: string, d: 1 | -1) {
    const l = listRef.current, i = l.findIndex((x) => x.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= l.length) return;
    const a = l[i], b = l[j];
    change(a.id, { position: b.position, content: { ...a.content, row: b.content.row, col: b.content.col } });
    change(b.id, { position: a.position, content: { ...b.content, row: a.content.row, col: a.content.col } }, true);
    setList([...listRef.current].sort((x, y) => x.position - y.position));
    if (isText(a.type)) focusReq.current = { id: a.id, at: 'end' };
  }
  function columns(id: string) {
    const l = listRef.current, i = l.findIndex((x) => x.id === id), b = l[i]; if (!b) return;
    if (!b.content.row) { const row = uid(); patchContent(id, { row, col: 0 }); insertAt(i, { type: 'text', content: { row, col: 1 } }); return; }
    const mates = l.filter((x) => x.content.row === b.content.row);
    const cols = new Set(mates.map((x) => x.content.col ?? 0));
    if (cols.size >= 4) { toast.ok('Up to 4 columns'); return; }
    const last = l.indexOf(mates[mates.length - 1]);
    insertAt(last, { type: 'text', content: { row: b.content.row, col: Math.max(...cols) + 1 } });
  }
  function duplicate(id: string) {
    const i = listRef.current.findIndex((x) => x.id === id), b = listRef.current[i]; if (!b) return;
    insertAt(i, { type: b.type, content: structuredClone(b.content), file_id: b.file_id, task_id: b.task_id, ref_page_id: b.ref_page_id }, null);
  }
  const undo = () => document.dispatchEvent(new CustomEvent('su:editor-undo', { detail: pageId }));

  function onKey(e: RKE<HTMLTextAreaElement>, b: PageBlock, i: number) {
    const el = e.currentTarget, text = el.value, s = el.selectionStart, en = el.selectionEnd, mod = e.metaKey || e.ctrlKey;
    if (mention && mention.id === b.id) {
      const total = mentionItems.length + 1;
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSel((x) => Math.min(x + 1, total - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSel((x) => Math.max(x - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); void pickMention(mentionItems[mentionSel] ?? 'new'); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (dateSug && dateSug.id === b.id) {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); void acceptDate(); return; }
      if (e.key === 'Escape') { e.preventDefault(); setDateSug(null); return; }
    }
    if (slashItems.length && b.id === focused) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSel((x) => Math.min(x + 1, slashItems.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSel((x) => Math.max(x - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); choose(slashItems[slashSel][0], b.id); return; }
      if (e.key === 'Escape') { e.preventDefault(); change(b.id, { content: { ...b.content, text: '' } }); return; }
    }
    if (e.key === 'Tab') { e.preventDefault(); indent(b.id, e.shiftKey ? -1 : 1); return; }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap(el, b, '**', '**', 'bold'); return; }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap(el, b, '*', '*', 'italic'); return; }
    if (mod && e.key.toLowerCase() === 'u') { e.preventDefault(); wrap(el, b, '__', '__', 'underline'); return; }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); wrap(el, b, '[', '](https://)', 'link'); return; }
    if (mod && e.shiftKey && e.key === 'ArrowUp') { e.preventDefault(); move(b.id, -1); return; }
    if (mod && e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); move(b.id, 1); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (['bullet', 'numbered', 'todo', 'quote', 'callout'].includes(b.type) && !text) { change(b.id, { type: 'text' }, true); return; }
      const before = text.slice(0, s), after = text.slice(en);
      if (after !== '' || before !== text) change(b.id, { content: { ...b.content, text: before } });
      const nextType: BlockType = ['bullet', 'numbered', 'todo'].includes(b.type) ? b.type : 'text';
      insertAt(i, { type: nextType, content: { text: after, indent: b.content.indent, row: b.content.row, col: b.content.col, ...(nextType === 'todo' ? { checked: false } : {}) } }, 0);
      return;
    }
    if (e.key === 'Backspace' && s === 0 && en === 0) {
      if ((b.content.indent ?? 0) > 0) { e.preventDefault(); indent(b.id, -1); return; }
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

  // ── Akıllı yapıştırma ──
  async function onPaste(e: RCE<HTMLTextAreaElement>, b: PageBlock, i: number) {
    const cd = e.clipboardData;
    const img = Array.from(cd.files).find((f) => f.type.startsWith('image/'));
    if (img) {
      e.preventDefault();
      try {
        const { rec } = await uploadFile(img);
        if (projectId) await addToGallery(rec.id, projectId);
        qc.invalidateQueries({ queryKey: ['files'] });
        if (!(b.content.text ?? '').trim() && b.type === 'text') change(b.id, { type: 'image', file_id: rec.id, content: { ...b.content, text: undefined } }, true);
        else insertAt(i, { type: 'image', file_id: rec.id, content: { row: b.content.row, col: b.content.col } }, null);
        toast.ok('Image added ✦');
      } catch (x) { toast.fail(x); }
      return;
    }
    const t = cd.getData('text/plain');
    if (/^https?:\/\/\S+$/.test(t.trim())) {
      e.preventDefault();
      const el = e.currentTarget;
      setPaste({ id: b.id, i, url: t.trim(), s: el.selectionStart, e: el.selectionEnd });
      return;
    }
    const lines = splitLines(t);
    if (lines.length > 1) {
      e.preventDefault();
      const empty = !(b.content.text ?? '').trim();
      let at = i;
      lines.forEach((l, k) => {
        const content = { text: l.text, ...(l.type === 'todo' ? { checked: !!l.checked } : {}), indent: b.content.indent, row: b.content.row, col: b.content.col };
        if (k === 0 && empty) { change(b.id, { type: l.type, content }, true); return; }
        insertAt(at, { type: l.type, content }, k === lines.length - 1 ? 'end' : null); at++;
      });
    }
  }
  function pasteAs(k: 'link' | 'card' | 'embed' | null) {
    const p = paste; setPaste(null); if (!p) return;
    const b = listRef.current.find((x) => x.id === p.id); if (!b) return;
    const host = (() => { try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { return p.url; } })();
    if (k === 'card' || k === 'embed') {
      const content = k === 'card' ? { url: p.url, title: host } : { url: p.url };
      if (!(b.content.text ?? '').trim() && b.type === 'text') change(b.id, { type: k === 'card' ? 'link' : 'embed', content: { ...content, row: b.content.row, col: b.content.col } }, true);
      else insertAt(p.i, { type: k === 'card' ? 'link' : 'embed', content: { ...content, row: b.content.row, col: b.content.col } }, null);
      return;
    }
    const v = b.content.text ?? '';
    const ins = k === 'link' ? `[${host}](${p.url})` : p.url;
    change(b.id, { content: { ...b.content, text: v.slice(0, p.s) + ins + v.slice(p.e) } }, true);
    focusReq.current = { id: b.id, at: p.s + ins.length };
  }

  // ── Sürükle-bırak (dnd-kit): parlayan çizgi, kenara gelince "yan yana koy" ──
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 320, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  function pointerOf(e: DragMoveEvent) {
    const a = e.activatorEvent as MouseEvent & TouchEvent;
    const x0 = a.touches?.[0]?.clientX ?? a.clientX ?? 0, y0 = a.touches?.[0]?.clientY ?? a.clientY ?? 0;
    return { x: x0 + e.delta.x, y: y0 + e.delta.y };
  }
  function onDragMove(e: DragMoveEvent) {
    if (!e.over || e.over.id === e.active.id) { setDrop(null); return; }
    const r = e.over.rect, p = pointerOf(e);
    const rel = (p.x - r.left) / Math.max(1, r.width);
    const pos: DropPos = rel < 0.16 ? 'left' : rel > 0.84 ? 'right' : p.y < r.top + r.height / 2 ? 'before' : 'after';
    setDrop((d) => (d?.id === e.over!.id && d.pos === pos ? d : { id: String(e.over!.id), pos }));
  }
  function onDragEnd(e: DragEndEvent) {
    const d = drop; setDrop(null); setDrag(null);
    if (!d || !e.over) return;
    const l = listRef.current, from = l.find((x) => x.id === e.active.id), to = l.find((x) => x.id === d.id);
    if (!from || !to || from.id === to.id) return;
    if (d.pos === 'left' || d.pos === 'right') {
      let row = to.content.row, col = to.content.col ?? 0;
      if (!row) { row = uid(); patchContent(to.id, { row, col: 0 }, false); col = 0; }
      const mates = new Set(l.filter((x) => x.content.row === row && x.id !== from.id).map((x) => x.content.col ?? 0));
      if (mates.size >= 4) { toast.ok('Up to 4 columns'); return; }
      const ti = l.indexOf(to), next = l[ti + 1];
      const pos = next && next.id !== from.id ? (to.position + next.position) / 2 : to.position + 0.5;
      change(from.id, { position: pos, content: { ...from.content, row, col: d.pos === 'left' ? col - 0.5 : col + 0.5 } }, true);
    } else {
      const ti = l.indexOf(to);
      const nb = d.pos === 'before' ? l[ti - 1] : l[ti + 1];
      const other = nb && nb.id !== from.id ? nb.position : (d.pos === 'before' ? to.position - 1 : to.position + 1);
      const { row: _r, col: _c, ...rest } = from.content; void _r; void _c;
      change(from.id, { position: (to.position + other) / 2, content: to.content.row ? { ...rest, row: to.content.row, col: to.content.col } : rest }, true);
    }
    setList([...listRef.current].sort((a, b) => a.position - b.position));
    normalizeRows();
  }

  // Mobil: sağa kaydır = girinti, sola kaydır = girintiyi geri al
  const sw = useRef<{ x: number; y: number; id: string } | null>(null);
  const touchStart = (e: RTE, id: string) => { if ((e.target as HTMLElement).closest('canvas, .draw-box')) return; sw.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id }; };
  const touchEnd = (e: RTE) => {
    const s = sw.current; sw.current = null; if (!s || drag) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 28) indent(s.id, dx > 0 ? 1 : -1);
  };

  const titleOf = useCallback((id: string) => pages.find((p) => p.id === id)?.title, [pages]);
  const nums = new Map<string, number>(); { let n = 0; for (const b of list) { n = b.type === 'numbered' ? n + 1 : 0; nums.set(b.id, n); } }
  const idx = new Map(list.map((b, i) => [b.id, i]));
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cur = active ?? focused;
  const bulk = {
    remove: () => { picked.forEach((id) => void remove(id)); setPicked(new Set()); },
    duplicate: () => { [...picked].forEach((id) => duplicate(id)); setPicked(new Set()); },
    transform: (t: BlockType) => { picked.forEach((id) => transform(id, t)); },
    bg: (c: string) => { picked.forEach((id) => patchContent(id, { bg: c || undefined })); },
  };

  const row = (b: PageBlock) => {
    const i = idx.get(b.id)!;
    return (
      <BlockRow key={b.id} b={b} dragging={drag === b.id} drop={drop?.id === b.id ? drop.pos : null} selecting={selecting} picked={picked.has(b.id)}
        onPick={() => togglePick(b.id)} onTouchStart={(e) => touchStart(e, b.id)} onTouchEnd={touchEnd}
        gutter={<button type="button" className="bg-btn" onClick={() => setMenu(menu?.at === i ? null : { at: i })} aria-label="Add block below"><Plus size={14} /></button>}
        del={<button type="button" className="bg-btn del" onClick={() => remove(b.id)} aria-label="Delete block"><Trash2 size={13} /></button>}>
        <div className="block-body" style={{ paddingLeft: (b.content.indent ?? 0) * 24, background: b.content.bg || undefined, color: b.content.color || undefined }} data-bg={b.content.bg ? '1' : undefined}
          onClick={() => { if (!isText(b.type)) setActive(b.id); }}>
          {isText(b.type)
            ? <TextBlock b={b} n={nums.get(b.id) ?? 0} onOpenPage={onOpenPage}
                register={(el) => { if (el) inputs.current.set(b.id, el); else inputs.current.delete(b.id); }}
                onChange={(t, c) => onTextChange(b, t, c)} onKeyDown={(e) => onKey(e, b, i)} titleOf={titleOf} onPaste={(e) => onPaste(e, b, i)}
                onSelect={(s, e) => setSelRange(s !== e ? { id: b.id, s, e } : null)}
                onFocus={() => { setFocused(b.id); setActive(null); }} onBlur={() => { void flush(); setTimeout(() => { setFocused((f) => (f === b.id ? null : f)); setMention((m) => (m?.id === b.id ? null : m)); setSelRange((r) => (r?.id === b.id && document.activeElement !== inputs.current.get(b.id) ? null : r)); }, 180); }}
                onCheck={(c) => change(b.id, { content: { ...b.content, checked: c } }, true)} />
            : <MediaBlock b={b} projectId={projectId} onChange={(patch) => change(b.id, patch, true)} onOpenPage={onOpenPage} onPick={() => setPicker({ type: b.type === 'file' ? 'file' : 'image', id: b.id })} pageId={pageId}
                insertBlocks={(bs) => { let at = i; bs.forEach((x) => { insertAt(at, { type: x.type, content: { text: x.text, ...(x.type === 'todo' ? { checked: !!x.checked } : {}), row: b.content.row, col: b.content.col } }, null); at++; }); }} />}
        </div>
        {selRange?.id === b.id && focused === b.id && !mention && <FormatBubble onFmt={format} />}
        {paste?.id === b.id && <PasteChoice url={paste.url} onPick={pasteAs} />}
        {slashItems.length > 0 && focused === b.id && (
          <div className="block-menu" role="listbox" aria-label="Blocks">
            {slashItems.map(([t, l, I], k) => <button type="button" key={t} role="option" aria-selected={k === slashSel} className={k === slashSel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); choose(t, b.id); }}><I size={15} />{l}</button>)}
          </div>
        )}
        {mention?.id === b.id && (
          <div className="block-menu" role="listbox" aria-label="Link a page">
            <span className="bm-cap">Link to page</span>
            {mentionItems.map((p, k) => <button type="button" key={p.id} role="option" aria-selected={k === mentionSel} className={k === mentionSel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); void pickMention(p); }}><FileText size={15} />{p.icon} {p.title}</button>)}
            <button type="button" role="option" aria-selected={mentionSel === mentionItems.length} className={mentionSel === mentionItems.length ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); void pickMention('new'); }}><Plus size={15} />New page{mention.q.trim() ? ` “${mention.q.trim()}”` : ''}</button>
          </div>
        )}
        {dateSug?.id === b.id && (
          <div className="block-menu" role="listbox" aria-label="Date">
            <span className="bm-cap">Date & reminder</span>
            <button type="button" role="option" aria-selected className="on" onMouseDown={(e) => { e.preventDefault(); void acceptDate(); }}><CalendarClock size={15} />{dateSug.p.label} · Enter</button>
          </div>
        )}
        {menu?.at === i && <PlusMenu menu={BLOCK_MENU} recent={recent} onPick={(t) => chooseInsert(t, i)} onPreset={(p) => preset(p, i)} onClose={() => setMenu(null)} />}
        {cur === b.id && !selecting && !slashItems.length && !mention && (
          <BlockTools menu={BLOCK_MENU} canText={isText(b.type)} a={{
            transform: (t) => transform(b.id, t), color: (c) => patchContent(b.id, { color: c || undefined }), bg: (c) => patchContent(b.id, { bg: c || undefined }),
            indent: (d) => indent(b.id, d), move: (d) => move(b.id, d), columns: () => columns(b.id), duplicate: () => duplicate(b.id),
            remove: () => { setActive(null); void remove(b.id); }, undo,
          }} />
        )}
      </BlockRow>
    );
  };

  // Ardışık aynı satırdaki bloklar yan yana (sütunlar)
  const segs: PageBlock[][] = [];
  for (const b of list) { const last = segs[segs.length - 1]; if (b.content.row && last && last[0].content.row === b.content.row) last.push(b); else segs.push([b]); }

  return (
    <div className={`blocks${selecting ? ' selecting' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('.block-body, .bt-bar, .bt-pop')) setActive(null); }}>
      <div className="blk-top">
        <button type="button" className={`btn btn-sm ${selecting ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setPicked(new Set()); }}><ListChecks size={13} />{selecting ? 'Done' : 'Select'}</button>
        {selecting && (
          <div className="blk-bulk" role="toolbar" aria-label="Selected blocks">
            <span className="small">{picked.size} selected</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={() => bulk.transform('text')}><Repeat2 size={13} />Text</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={() => bulk.transform('todo')}><CheckSquare size={13} />To do</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={() => bulk.bg(BG_COLORS[1])}><Palette size={13} />Tint</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={() => bulk.bg('')}><X size={13} />Clear tint</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={bulk.duplicate}><Copy size={13} />Duplicate</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={bulk.remove}><Trash2 size={13} />Delete</button>
          </div>
        )}
      </div>
      {list.length === 0 && !q.isLoading && <button type="button" className="block-empty" onClick={() => insertAt(-1, { type: 'text' })}><Type size={14} /> Click to start writing · type “/” for blocks</button>}
      <DndContext sensors={sensors} onDragStart={(e) => setDrag(String(e.active.id))} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDrag(null); setDrop(null); }}>
        {segs.map((seg) => {
          if (!seg[0].content.row) return seg.map(row);
          const cols = [...new Set(seg.map((b) => b.content.col ?? 0))].sort((a, b) => a - b);
          return (
            <div key={'row-' + seg[0].content.row} className="blk-cols" style={{ ['--n' as string]: cols.length }}>
              {cols.map((c) => <div key={c} className="blk-col">{seg.filter((b) => (b.content.col ?? 0) === c).map(row)}</div>)}
            </div>
          );
        })}
      </DndContext>
      {list.length > 0 && <button type="button" className="btn btn-ghost btn-sm block-add" onClick={() => insertAt(list.length - 1, { type: 'text' })}><Plus size={13} />Add block</button>}
      {picker && <Picker projectId={projectId} type={picker.type} pageId={pageId} pages={pages} onClose={() => setPicker(null)}
        onPick={(extra) => { const b = listRef.current.find((x) => x.id === picker.id); change(picker.id, { type: picker.type, ...extra, content: { ...(extra.content ?? {}), indent: b?.content.indent, row: b?.content.row, col: b?.content.col } }, true); setPicker(null); }} />}
    </div>
  );
}


function BlockRow({ b, dragging, drop, selecting, picked, onPick, gutter, del, children, onTouchStart, onTouchEnd }: {
  b: PageBlock; dragging: boolean; drop: DropPos | null; selecting: boolean; picked: boolean; onPick: () => void; gutter: ReactNode; del: ReactNode; children: ReactNode;
  onTouchStart: (e: RTE) => void; onTouchEnd: (e: RTE) => void;
}) {
  const dr = useDraggable({ id: b.id });
  const dp = useDroppable({ id: b.id });
  const ls = (dr.listeners ?? {}) as Record<string, (e: unknown) => void>;
  return (
    <div ref={dp.setNodeRef} id={`blk-${b.id}`} className={`block-row${dragging ? ' dragging' : ''}${drop ? ` drop-${drop}` : ''}${picked ? ' picked' : ''}`}
      onClickCapture={(e) => { if (selecting) { e.preventDefault(); e.stopPropagation(); onPick(); } }}
      onTouchStart={(e) => { onTouchStart(e); if (!selecting && !(e.target as HTMLElement).closest('.grip, .bt-bar, button, input, a, canvas, iframe, .draw-box')) ls.onTouchStart?.(e); }} onTouchEnd={onTouchEnd}>
      <div className="block-gutter">
        {selecting ? <input type="checkbox" className="blk-check" checked={picked} readOnly aria-label="Select block" /> : <>
          {gutter}
          <button type="button" ref={dr.setNodeRef} className="bg-btn grip" aria-label="Drag (or long-press the block)" {...dr.attributes} {...dr.listeners}><GripVertical size={14} /></button>
        </>}
      </div>
      {children}
      {!selecting && del}
      {(drop === 'left' || drop === 'right') && <span className="drop-side-l" aria-hidden="true">Side by side</span>}
    </div>
  );
}

// Sayfa düzeyinde erişim (geri al/yinele, geçmişten geri yükleme)
export const apiRef = new Map<string, { flush: () => Promise<void>; applyVersion: (id: string, v: PageBlock | null) => Promise<void> }>();

/** Metin bloğu: düzenlerken textarea, değilken biçimli önizleme (biçim işareti varsa). */
function TextBlock({ b, n, register, onChange, onKeyDown, onFocus, onBlur, onCheck, onOpenPage, titleOf, onPaste, onSelect }: {
  titleOf?: (id: string) => string | undefined;
  b: PageBlock; n: number; register: (el: HTMLTextAreaElement | null) => void; onChange: (t: string, caret: number) => void;
  onKeyDown: (e: RKE<HTMLTextAreaElement>) => void; onFocus: () => void; onBlur: () => void; onCheck: (c: boolean) => void; onOpenPage: (id: string) => void;
  onPaste: (e: RCE<HTMLTextAreaElement>) => void; onSelect: (s: number, e: number) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [editing, setEditing] = useState(false);
  const text = b.content.text ?? '';
  const preview = !editing && HAS_MARKUP.test(text);
  useLayoutEffect(() => { const el = ref.current; if (el && !preview) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [text, preview, b.type]);
  const cls = `block-text ${['h1', 'h2', 'h3'].includes(b.type) ? b.type : ''} ${b.type === 'todo' && b.content.checked ? 'checked' : ''}`;
  const sel = (e: { currentTarget: HTMLTextAreaElement }) => onSelect(e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
  const field = (
    <div className={`rt${preview ? ' rt-prev' : ''}`}>
      {preview && <div className={cls} onClick={() => { ref.current?.focus(); }}>{renderInline(text, onOpenPage, titleOf)}</div>}
      <textarea ref={(el) => { ref.current = el; register(el); }} rows={1} className={cls} value={text} placeholder={PLACEHOLDER[b.type] ?? 'Type “/” for blocks…'}
        aria-label={PLACEHOLDER[b.type] ?? 'Text'} tabIndex={preview ? -1 : 0} style={b.content.color ? { color: b.content.color } : undefined}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)} onKeyDown={onKeyDown} onPaste={onPaste}
        onSelect={sel} onMouseUp={sel} onKeyUp={sel}
        onFocus={() => { setEditing(true); onFocus(); }} onBlur={() => { setEditing(false); onBlur(); }} />
    </div>
  );
  switch (b.type) {
    case 'bullet': return <div className="li"><span className="li-mark">{['•', '◦', '▪', '•', '◦'][b.content.indent ?? 0]}</span>{field}</div>;
    case 'numbered': return <div className="li"><span className="li-mark">{n}.</span>{field}</div>;
    case 'todo': return <div className="li"><input id={`td-${b.id}`} type="checkbox" checked={!!b.content.checked} onChange={(e) => onCheck(e.target.checked)} style={{ marginTop: 7 }} aria-label="Done" />{field}</div>;
    case 'quote': return <div className="quote">{field}</div>;
    case 'callout': return <div className="callout"><span>✦</span>{field}</div>;
    default: return field;
  }
}

function MediaBlock({ b, projectId, onChange, onOpenPage, onPick, pageId, insertBlocks }: { b: PageBlock; projectId: string | null; onChange: (patch: Partial<PageBlock>) => void; onOpenPage: (id: string) => void; onPick: () => void; pageId: string; insertBlocks: ExtraProps['insertBlocks'] }) {
  const tasks = useTasks();
  const files = useFiles();
  void projectId;
  switch (b.type) {
    case 'divider': return <hr className="divider" />;
    case 'link': return <LinkBlock b={b} onChange={onChange} />;
    case 'embed': return b.content.url ? <EmbedBlock url={b.content.url} /> : <EmbedForm onSave={(url) => onChange({ content: { ...b.content, url } })} />;
    case 'image': {
      if (!b.file_id) return <button type="button" className="img-empty" onClick={onPick}><ImagePlus size={20} /><span>Choose image</span></button>;
      const f = files.data?.find((x) => x.id === b.file_id);
      return f ? <figure className="img-block"><div><Thumb file={f} fit="contain" /></div><figcaption>{b.content.caption || f.title}</figcaption></figure> : <p className="small muted">{files.isLoading ? 'Loading…' : 'The image was removed.'}</p>;
    }
    case 'file': return <FileBlock file={files.data?.find((x) => x.id === b.file_id)} />;
    case 'task': {
      const t = tasks.data?.find((x) => x.id === b.task_id);
      return t ? <TaskRow task={t} /> : <p className="small muted">The task was deleted.</p>;
    }
    case 'page': return b.ref_page_id ? <button type="button" className="page-link" onClick={() => onOpenPage(b.ref_page_id!)}><FileText size={14} />{b.content.title ?? 'Page'}</button> : null;
    default: return <ExtraBlock b={b} onChange={onChange} pageId={pageId} projectId={projectId} insertBlocks={insertBlocks} />;
  }
}

function EmbedForm({ onSave }: { onSave: (url: string) => void }) {
  const [u, setU] = useState('');
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); let v = u.trim(); if (!v) return; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; try { new URL(v); onSave(v); } catch { /* geçersiz */ } }}>
      <input className="input" style={{ flex: '1 1 200px', width: 'auto' }} placeholder="Paste a YouTube, Vimeo, Spotify, Maps… link" value={u} onChange={(e) => setU(e.target.value)} autoFocus aria-label="Embed link" />
      <button className="btn btn-primary btn-sm"><Code2 size={13} />Embed</button>
    </form>
  );
}
void TEXT_COLORS;


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
