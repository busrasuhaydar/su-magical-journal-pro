// Sayfa görünümü: yol, simge, başlık, işlemler, blok editörü, alt sayfalar. Proje sayfaları ve proje dışı sayfalar ortak kullanır.
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRelative, dayKeyOf } from '../../lib/dates';
import type { Page } from '../../lib/types';
import { ConfirmButton, useToast } from '../ui';
import { BlockEditor, type PageLite } from './BlockEditor';
import { HistoryButton } from './History';
import { Backlinks } from './Backlinks';

export const PAGE_ICONS = ['📄', '💡', '🔍', '🎨', '🗒️', '🛠️', '🏁', '📸', '✨', '📚', '🌸', '🔮'];

export function PageView({ page, pages, projectId, onOpenPage, onCreateChild, actions }: {
  page: Page; pages: PageLite[]; projectId: string | null; onOpenPage: (id: string | null) => void; onCreateChild: () => void; actions?: ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(page.title);
  const kids = pages.filter((x) => x.parent_id === page.id);
  const crumbs: PageLite[] = [];
  for (let c: PageLite | undefined = page; c; c = pages.find((x) => x.id === c!.parent_id)) crumbs.unshift(c);
  async function saveTitle() {
    if (title.trim() === page.title) return;
    const { error } = await supabase.from('pages').update({ title: title.trim() || 'Untitled page' }).eq('id', page.id);
    if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['pages'] });
  }
  return (
    <section className="glass panel page-editor">
      <div className="small muted row" style={{ gap: 4 }}>
        {crumbs.map((c, i) => <span key={c.id}>{i > 0 && ' / '}<button type="button" className="crumb" onClick={() => onOpenPage(c.id)}>{c.icon} {c.title}</button></span>)}
      </div>
      <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <select id="pg-icon" className="icon-pick" value={page.icon ?? '📄'} onChange={async (e) => { await supabase.from('pages').update({ icon: e.target.value }).eq('id', page.id); qc.invalidateQueries({ queryKey: ['pages'] }); }} aria-label="Page icon">
          {[...new Set([page.icon ?? '📄', ...PAGE_ICONS])].map((i) => <option key={i}>{i}</option>)}
        </select>
        <input id="pg-title" className="page-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Page title" />
      </div>
      <div className="row small muted" style={{ marginBottom: 10 }}>
        <span>Last edited: {formatRelative(dayKeyOf(page.updated_at))}</span>
        {actions}
        <HistoryButton pageId={page.id} />
        <ConfirmButton label={<><Trash2 size={13} />Delete page</>} className="btn btn-ghost btn-sm" confirmText="Move the page and its subpages to trash?"
          onConfirm={async () => { const { error } = await supabase.from('pages').update({ deleted_at: new Date().toISOString() }).eq('id', page.id); if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['pages'] }); onOpenPage(page.parent_id); } }} />
      </div>
      <BlockEditor key={page.id} pageId={page.id} projectId={projectId} pages={pages} onOpenPage={onOpenPage} />
      <div style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Subpages</b><button type="button" className="btn btn-glass btn-sm" onClick={onCreateChild}><Plus size={13} />Subpage</button></div>
        <div className="row" style={{ marginTop: 6 }}>{kids.map((k) => <button type="button" key={k.id} className="chip" style={{ cursor: 'pointer', padding: '6px 12px' }} onClick={() => onOpenPage(k.id)}>{k.icon} {k.title}</button>)}{!kids.length && <span className="small muted">None</span>}</div>
      </div>
      <Backlinks pageId={page.id} />
    </section>
  );
}
