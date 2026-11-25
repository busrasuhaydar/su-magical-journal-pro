// Sayfa ağacı (proje sayfaları ve proje dışı sayfalar): iç içe sayfalar, yeni sayfa / şablonlar.
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FilePlus2, Plus } from 'lucide-react';
import type { PageLite } from './BlockEditor';

export const PAGE_TEMPLATES: [string, string][] = [['Ideas', '💡'], ['Research', '🔍'], ['Designs', '🎨'], ['Meeting Notes', '🗒️'], ['Production Process', '🛠️'], ['Results', '🏁']];

export function PageTree({ pages, sel, onOpen, onCreate, title = 'Pages', footer }: {
  pages: PageLite[]; sel: string | null; onOpen: (id: string) => void; onCreate: (parent: string | null, title?: string, icon?: string) => void; title?: string; footer?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const children = (pid: string | null) => pages.filter((x) => x.parent_id === pid || (pid === null && x.parent_id && !pages.some((p) => p.id === x.parent_id)))
    .sort((a, b) => ((a as { position?: number }).position ?? 0) - ((b as { position?: number }).position ?? 0));
  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <>{children(pid).map((pg) => {
      const kids = children(pg.id);
      return (
        <div key={pg.id}>
          <div className={`tree-row${sel === pg.id ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
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
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>{title}</b><button type="button" className={`btn btn-sm ${newOpen ? 'btn-primary' : 'btn-glass'}`} aria-expanded={newOpen} onClick={() => setNewOpen((o) => !o)}><FilePlus2 size={13} />New</button></div>
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
