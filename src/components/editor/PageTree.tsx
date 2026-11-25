// Sayfa ağacı (proje sayfaları ve proje dışı sayfalar): iç içe sayfalar, yeni sayfa / şablonlar.
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FilePlus2, FolderInput, ListChecks, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useProjects } from '../../lib/data';
import { BulkBar } from '../BulkActions';
import { ConfirmButton, useToast } from '../ui';
import type { PageLite } from './BlockEditor';

export const PAGE_TEMPLATES: [string, string][] = [['Ideas', '💡'], ['Research', '🔍'], ['Designs', '🎨'], ['Meeting Notes', '🗒️'], ['Production Process', '🛠️'], ['Results', '🏁']];

export function PageTree({ pages, sel: current, onOpen, onCreate, title = 'Pages', footer }: {
  pages: PageLite[]; sel: string | null; onOpen: (id: string) => void; onCreate: (parent: string | null, title?: string, icon?: string) => void; title?: string; footer?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const projects = useProjects();
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** Seçili sayfaları taşı: "p:<id>" başka sayfanın altına, "proj:<id>" projeye (en üst), "free" proje dışı sayfalara. */
  async function move(target: string) {
    const ids = [...sel]; if (!ids.length) return;
    const parent = target.startsWith('p:') ? target.slice(2) : null;
    if (parent && ids.includes(parent)) return toast.fail(new Error('A page can’t be moved under itself.'));
    const patch: Record<string, unknown> = { parent_id: parent };
    if (target.startsWith('proj:')) patch.project_id = target.slice(5);
    if (target === 'free') patch.project_id = null;
    if (parent) patch.project_id = pages.find((p) => p.id === parent)?.project_id ?? null;
    // Alt sayfalar da aynı projeye gider
    const all = new Set(ids);
    if ('project_id' in patch) { let grew = true; while (grew) { grew = false; for (const p of pages) if (p.parent_id && all.has(p.parent_id) && !all.has(p.id)) { all.add(p.id); grew = true; } } }
    const { error } = await supabase.from('pages').update(patch).in('id', ids);
    if (!error && all.size > ids.length && 'project_id' in patch) await supabase.from('pages').update({ project_id: patch.project_id }).in('id', [...all].filter((x) => !ids.includes(x)));
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['pages'] }); toast.ok(`${ids.length} pages moved`); setSel(new Set());
  }
  async function remove() {
    const ids = [...sel];
    const { error } = await supabase.from('pages').update({ deleted_at: new Date().toISOString() }).in('id', ids);
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['pages'] }); toast.ok(`${ids.length} pages moved to trash`); setSel(new Set());
  }
  const children = (pid: string | null) => pages.filter((x) => x.parent_id === pid || (pid === null && x.parent_id && !pages.some((p) => p.id === x.parent_id)))
    .sort((a, b) => ((a as { position?: number }).position ?? 0) - ((b as { position?: number }).position ?? 0));
  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <>{children(pid).map((pg) => {
      const kids = children(pg.id);
      return (
        <div key={pg.id}>
          <div className={`tree-row${current === pg.id ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
            {selecting && <input id={`ps-${pg.id}`} type="checkbox" checked={sel.has(pg.id)} onChange={() => toggle(pg.id)} aria-label={`Select ${pg.title}`} />}
            <button type="button" className="tree-tog" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(pg.id)) n.delete(pg.id); else n.add(pg.id); return n; })} aria-label="Expand/collapse" style={{ visibility: kids.length ? 'visible' : 'hidden' }}>
              {collapsed.has(pg.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
            <button type="button" className="tree-title" onClick={() => onOpen(pg.id)}>{pg.icon ?? '📄'} {pg.title}</button>
            <button type="button" className="tree-add" onClick={() => onCreate(pg.id)} aria-label="Add subpage" title="Add subpage"><Plus size={13} /></button>
          </div>
          {!collapsed.has(pg.id) && <Tree pid={pg.id} depth={depth + 1} />}
        </div>
      );
    })}</>
  );
  return (
    <aside className="glass panel pages-tree">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>{title}</b><span className="row" style={{ gap: 4 }}><button type="button" className={`btn btn-sm ${selecting ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={selecting} onClick={() => { setSelecting((x) => !x); setSel(new Set()); }} title="Select pages" aria-label="Select pages"><ListChecks size={13} /></button><button type="button" className={`btn btn-sm ${newOpen ? 'btn-primary' : 'btn-glass'}`} aria-expanded={newOpen} onClick={() => setNewOpen((o) => !o)}><FilePlus2 size={13} />New</button></span></div>
      {selecting && (
        <BulkBar count={sel.size} total={pages.length} onAll={() => setSel(new Set(pages.map((p) => p.id)))} onClear={() => setSel(new Set())}>
          <label className="bulk-field"><FolderInput size={13} /><select id="pt-move" className="select" value="" disabled={!sel.size} onChange={(e) => e.target.value && void move(e.target.value)} aria-label="Move pages">
            <option value="">Move to…</option>
            <option value="top">Top level (here)</option>
            <optgroup label="Under page">{pages.filter((p) => !sel.has(p.id)).map((p) => <option key={p.id} value={`p:${p.id}`}>{p.icon} {p.title}</option>)}</optgroup>
            <optgroup label="Elsewhere"><option value="free">Pages (no project)</option>{projects.data?.map((p) => <option key={p.id} value={`proj:${p.id}`}>{p.icon ?? '✦'} {p.title}</option>)}</optgroup>
          </select></label>
          <ConfirmButton className="btn btn-ghost btn-sm" label={<><Trash2 size={13} />Delete</>} confirmText={`Trash ${sel.size} pages?`} onConfirm={remove} />
        </BulkBar>
      )}
      {newOpen && (
        <div className="new-menu">
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setNewOpen(false); onCreate(null); }}><FilePlus2 size={13} />Blank page</button>
          {PAGE_TEMPLATES.map(([t, i]) => <button type="button" key={t} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setNewOpen(false); onCreate(null, t, i); }}><Plus size={13} />{i} {t}</button>)}
        </div>
      )}
      {pages.length === 0 && <p className="small muted">No pages yet.</p>}
      <Tree pid={null} depth={0} />
      {footer}
    </aside>
  );
}
