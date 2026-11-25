// Sayfa görünümü: kapak, yol, simge, başlık, işlemler (favori, geçmiş, geri al/yinele), içindekiler,
// blok editörü, alt sayfalar ve geri bağlantılar. Proje sayfaları ve proje dışı sayfalar ortak kullanır.
import { useCallback, useRef, useState, type KeyboardEvent as RKE, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, ListTree, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRelative, dayKeyOf } from '../../lib/dates';
import { pageHref, useFiles, useProjects } from '../../lib/data';
import { useTrackRecent } from '../../lib/ui';
import type { Page, PageBlock } from '../../lib/types';
import { ConfirmButton, useToast } from '../ui';
import { MediaPickerDialog, Thumb } from '../Media';
import { FavButton } from '../FavButton';
import { apiRef, BlockEditor, type Op, type PageLite } from './BlockEditor';
import { HistoryButton } from './History';
import { Backlinks } from './Backlinks';

export const PAGE_ICONS = ['📄', '💡', '🔍', '🎨', '🗒️', '🛠️', '🏁', '📸', '✨', '📚', '🌸', '🔮'];

export function PageView({ page, pages, projectId, onOpenPage, onCreateChild, actions }: {
  page: Page; pages: PageLite[]; projectId: string | null; onOpenPage: (id: string | null) => void; onCreateChild: () => void; actions?: ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useProjects();
  const files = useFiles();
  const [title, setTitle] = useState(page.title);
  const [heads, setHeads] = useState<PageBlock[]>([]);
  const [coverPick, setCoverPick] = useState(false);
  const undo = useRef<Op[][]>([]), redo = useRef<Op[][]>([]), applying = useRef(false);
  const [, bump] = useState(0);
  const kids = pages.filter((x) => x.parent_id === page.id);
  const crumbs: PageLite[] = [];
  for (let c: PageLite | undefined = page; c; c = pages.find((x) => x.id === c!.parent_id)) crumbs.unshift(c);
  const cover = page.cover_file_id ? files.data?.find((f) => f.id === page.cover_file_id) : undefined;
  const ref = { kind: 'page' as const, id: page.id, label: page.title, icon: page.icon ?? '📄', href: pageHref(page, projects.data) };
  useTrackRecent(ref);

  async function saveTitle() {
    if (title.trim() === page.title) return;
    const { error } = await supabase.from('pages').update({ title: title.trim() || 'Untitled page' }).eq('id', page.id);
    if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['pages'] });
  }
  async function setPage(patch: Partial<Page>) {
    const { error } = await supabase.from('pages').update(patch).eq('id', page.id);
    if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['pages'] });
  }

  // Geri al / yinele (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z veya Ctrl+Y)
  const onOps = useCallback((ops: Op[]) => {
    if (applying.current) return;
    undo.current.push(ops); if (undo.current.length > 100) undo.current.shift();
    redo.current = []; bump((x) => x + 1);
  }, []);
  async function step(dir: 'undo' | 'redo') {
    const api = apiRef.get(page.id); if (!api) return;
    await api.flush();
    const from = dir === 'undo' ? undo.current : redo.current, to = dir === 'undo' ? redo.current : undo.current;
    const ops = from.pop(); if (!ops) return;
    applying.current = true;
    try {
      const seq = dir === 'undo' ? [...ops].reverse() : ops;
      for (const o of seq) { const id = (o.after ?? o.before)!.id; await api.applyVersion(id, dir === 'undo' ? o.before : o.after); }
    } finally { applying.current = false; }
    to.push(ops); bump((x) => x + 1);
  }
  const onKey = (e: RKE) => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (!mod || (e.target as HTMLElement).id === 'pg-title') return;
    if (k === 'z') { e.preventDefault(); void step(e.shiftKey ? 'redo' : 'undo'); }
    else if (k === 'y') { e.preventDefault(); void step('redo'); }
  };
  const onText = useCallback((bl: PageBlock[]) => setHeads(bl.filter((b) => ['h1', 'h2', 'h3'].includes(b.type) && (b.content.text ?? '').trim())), []);

  return (
    <section className="glass panel page-editor" onKeyDownCapture={onKey}>
      {cover && (
        <div className="pg-cover">
          <Thumb file={cover} />
          <div className="pg-cover-acts">
            <button type="button" className="btn btn-glass btn-sm" onClick={() => setCoverPick(true)}><ImagePlus size={13} />Change cover</button>
            <button type="button" className="btn btn-glass btn-sm" onClick={() => setPage({ cover_file_id: null })}><X size={13} />Remove</button>
          </div>
        </div>
      )}
      <div className="small muted row" style={{ gap: 4 }}>
        {crumbs.map((c, i) => <span key={c.id}>{i > 0 && ' / '}<button type="button" className="crumb" onClick={() => onOpenPage(c.id)}>{c.icon} {c.title}</button></span>)}
      </div>
      <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <select id="pg-icon" className="icon-pick" value={page.icon ?? '📄'} onChange={(e) => setPage({ icon: e.target.value })} aria-label="Page icon">
          {[...new Set([page.icon ?? '📄', ...PAGE_ICONS])].map((i) => <option key={i}>{i}</option>)}
        </select>
        <input id="pg-title" className="page-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Page title" />
      </div>
      <div className="row small muted pg-acts">
        <span>Last edited: {formatRelative(dayKeyOf(page.updated_at))}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => step('undo')} disabled={!undo.current.length} title="Undo (⌘Z)" aria-label="Undo"><Undo2 size={13} /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => step('redo')} disabled={!redo.current.length} title="Redo (⇧⌘Z)" aria-label="Redo"><Redo2 size={13} /></button>
        <FavButton item={ref} />
        {!cover && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCoverPick(true)}><ImagePlus size={13} />Cover</button>}
        {actions}
        <HistoryButton pageId={page.id} />
        <ConfirmButton label={<><Trash2 size={13} />Delete page</>} className="btn btn-ghost btn-sm" confirmText="Move the page and its subpages to trash?"
          onConfirm={async () => { const { error } = await supabase.from('pages').update({ deleted_at: new Date().toISOString() }).eq('id', page.id); if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['pages'] }); onOpenPage(page.parent_id); } }} />
      </div>
      {heads.length >= 2 && (
        <details className="toc" open>
          <summary><ListTree size={14} /> Contents</summary>
          <nav aria-label="Page contents">
            {heads.map((h) => <button type="button" key={h.id} className={`toc-${h.type}`} onClick={() => document.getElementById(`blk-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{(h.content.text ?? '').replace(/\[\[page:[^|]+\|([^\]]*)\]\]/g, '$1').replace(/[*`]/g, '')}</button>)}
          </nav>
        </details>
      )}
      <BlockEditor key={page.id} pageId={page.id} projectId={projectId} pages={pages} onOpenPage={onOpenPage} onOps={onOps} onText={onText} />
      <div style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Subpages</b><button type="button" className="btn btn-glass btn-sm" onClick={onCreateChild}><Plus size={13} />Subpage</button></div>
        <div className="row" style={{ marginTop: 6 }}>{kids.map((k) => <button type="button" key={k.id} className="chip" style={{ cursor: 'pointer', padding: '6px 12px' }} onClick={() => onOpenPage(k.id)}>{k.icon} {k.title}</button>)}{!kids.length && <span className="small muted">None</span>}</div>
      </div>
      <Backlinks pageId={page.id} />
      {coverPick && <MediaPickerDialog mode="gallery" visualOnly multiple={false} onClose={() => setCoverPick(false)} onPick={(fs) => { setCoverPick(false); if (fs[0]) void setPage({ cover_file_id: fs[0].id }); }} />}
    </section>
  );
}
