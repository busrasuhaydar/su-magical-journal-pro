// Subpages: sınırsız iç içe sayfa, blok tabanlı içerik. Image blokları galeriden seçer (kopya yok),
// görev blokları gerçek görev kaydını canlı gösterir.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FilePlus2, Plus } from 'lucide-react';
import { usePages } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import type { Project } from '../../lib/types';
import { PageView } from '../../components/editor/PageView';
import { Empty, useToast } from '../../components/ui';
import { LinkButton } from './Links';

const TEMPLATES = ['Ideas', 'Research', 'Designs', 'Meeting Notes', 'Production Process', 'Results'];
const ICONS = ['📄', '💡', '🔍', '🎨', '🗒️', '🛠️', '🏁', '📸', '✨', '📚'];

export function PagesTab({ p, initialPage, onOpenPage }: { p: Project; initialPage?: string; onOpenPage: (id: string | null) => void }) {
  const pages = usePages(p.id);
  const qc = useQueryClient();
  const toast = useToast();
  const sel = initialPage && pages.data?.some((x) => x.id === initialPage) ? initialPage : null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  async function create(parent: string | null, title = 'Untitled page', icon = '📄') {
    const siblings = (pages.data ?? []).filter((x) => x.parent_id === parent);
    const { data, error } = await supabase.from('pages').insert({ project_id: p.id, parent_id: parent, title, icon, position: (siblings.at(-1)?.position ?? 0) + 1 }).select().single();
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['pages'] });
    onOpenPage(data.id);
  }
  const children = (pid: string | null) => (pages.data ?? []).filter((x) => x.parent_id === pid).sort((a, b) => a.position - b.position);
  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <>{children(pid).map((pg) => {
      const kids = children(pg.id);
      return (
        <div key={pg.id}>
          <div className={`tree-row${sel === pg.id ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
            <button type="button" className="tree-tog" onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(pg.id) ? n.delete(pg.id) : n.add(pg.id); return n; })} aria-label="Expand/collapse" style={{ visibility: kids.length ? 'visible' : 'hidden' }}>
              {collapsed.has(pg.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
            <button type="button" className="tree-title" onClick={() => onOpenPage(pg.id)}>{pg.icon ?? '📄'} {pg.title}</button>
            <button type="button" className="tree-add" onClick={() => create(pg.id)} aria-label="Add subpage" title="Add subpage"><Plus size={13} /></button>
          </div>
          {!collapsed.has(pg.id) && <Tree pid={pg.id} depth={depth + 1} />}
        </div>
      );
    })}</>
  );

  return (
    <div className="pages-layout">
      <aside className="glass panel pages-tree">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>Pages</b><button type="button" className={`btn btn-sm ${newOpen ? 'btn-primary' : 'btn-glass'}`} aria-expanded={newOpen} onClick={() => setNewOpen((o) => !o)}><FilePlus2 size={13} />New</button></div>
        {newOpen && (
          <div className="new-menu">
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setNewOpen(false); create(null); }}>📄 Blank page</button>
            {TEMPLATES.map((t, i) => <button type="button" key={t} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setNewOpen(false); create(null, t, ICONS[i + 1]); }}>{ICONS[i + 1]} {t}</button>)}
          </div>
        )}
        <Tree pid={null} depth={0} />
      </aside>
      {sel ? <PageView key={sel} page={pages.data!.find((x) => x.id === sel)!} pages={pages.data ?? []} projectId={p.id} onOpenPage={onOpenPage} onCreateChild={() => create(sel)} actions={<LinkButton fromType="page" fromId={sel} excludeProject={p.id} />} />
        : <section className="glass panel"><Empty title="Select a page">Ideas, research, designs, meeting notes… You can open as many subpages as you like inside each page.</Empty></section>}
    </div>
  );
}

