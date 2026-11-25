// Sayfalar: projeye bağlı olmayan serbest sayfalar (sayfa ağacı + aynı akıllı editör).
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { Empty, useToast } from '../components/ui';
import { PageView } from '../components/editor/PageView';
import { PageTree } from '../components/editor/PageTree';
import { pageHref, useAllPages, useProjects } from '../lib/data';
import { supabase } from '../lib/supabase';
import type { Page } from '../lib/types';

export function useLoosePages() {
  return useQuery({ queryKey: ['pages', 'loose'], queryFn: async () => {
    const { data, error } = await supabase.from('pages').select('*').is('project_id', null).is('journal_day', null).is('deleted_at', null).order('position');
    if (error) throw error; return data as Page[];
  } });
}

export default function PagesPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const pages = useLoosePages();
  const all = useAllPages();
  const projects = useProjects();
  const list = pages.data ?? [];
  const sel = id && list.some((x) => x.id === id) ? id : null;
  const open = (pid: string | null) => {
    if (!pid) return nav('/pages');
    const loose = list.find((x) => x.id === pid);
    nav(loose ? `/pages/${pid}` : pageHref(all.data?.find((x) => x.id === pid), projects.data));
  };
  async function create(parent: string | null, title = 'Untitled page', icon = '📄') {
    const siblings = list.filter((x) => x.parent_id === parent);
    const { data, error } = await supabase.from('pages').insert({ project_id: null, parent_id: parent, title, icon, position: (siblings.at(-1)?.position ?? 0) + 1 }).select().single();
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['pages'] });
    nav(`/pages/${data.id}`);
  }
  return (
    <>
      <PageHead title="Pages">
        <button type="button" className="btn btn-primary" onClick={() => create(null)}><FilePlus2 size={15} />New page</button>
      </PageHead>
      <div className="pages-layout">
        <PageTree pages={list} sel={sel} onOpen={(pid) => nav(`/pages/${pid}`)} onCreate={create} title="My pages" />
        {sel ? <PageView key={sel} page={list.find((x) => x.id === sel)!} pages={all.data ?? list} projectId={null} onOpenPage={open} onCreateChild={() => create(sel)} />
          : <section className="glass panel"><Empty title="Free pages">Notes, lists, plans that don’t belong to a project. Type “/” in a page to add headings, lists, images, tasks…</Empty></section>}
      </div>
    </>
  );
}
