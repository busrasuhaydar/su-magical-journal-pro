// Proje sayfaları: sınırsız iç içe sayfa, ortak akıllı blok editörü.
import { useQueryClient } from '@tanstack/react-query';
import { usePages } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import type { Project } from '../../lib/types';
import { Empty, useToast } from '../../components/ui';
import { PageView } from '../../components/editor/PageView';
import { PageTree } from '../../components/editor/PageTree';
import { LinkButton } from './Links';

export function PagesTab({ p, initialPage, onOpenPage }: { p: Project; initialPage?: string; onOpenPage: (id: string | null) => void }) {
  const pages = usePages(p.id);
  const qc = useQueryClient();
  const toast = useToast();
  const sel = initialPage && pages.data?.some((x) => x.id === initialPage) ? initialPage : null;
  async function create(parent: string | null, title = 'Untitled page', icon = '📄') {
    const siblings = (pages.data ?? []).filter((x) => x.parent_id === parent);
    const { data, error } = await supabase.from('pages').insert({ project_id: p.id, parent_id: parent, title, icon, position: (siblings.at(-1)?.position ?? 0) + 1 }).select().single();
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['pages'] });
    onOpenPage(data.id);
  }
  return (
    <div className="pages-layout">
      <PageTree pages={pages.data ?? []} sel={sel} onOpen={onOpenPage} onCreate={create} />
      {sel ? <PageView key={sel} page={pages.data!.find((x) => x.id === sel)!} pages={pages.data ?? []} projectId={p.id} onOpenPage={onOpenPage} onCreateChild={() => create(sel)} actions={<LinkButton fromType="page" fromId={sel} excludeProject={p.id} />} />
        : <section className="glass panel"><Empty title="Select a page">Ideas, research, designs, meeting notes… You can open as many subpages as you like inside each page.</Empty></section>}
    </div>
  );
}
