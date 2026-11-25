// Çöp kutusu: deleted_at dolu her kayıt; geri getir veya kalıcı sil. 30 günden eskileri her gece kalıcı silinir.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConfirmButton, useToast } from '../../components/ui';

type Row = { table_name: string; id: string; title: string; deleted_at: string };
const LABEL: Record<string, string> = { tasks: 'Task', events: 'Event', projects: 'Project', journal_blocks: 'Journal item', files: 'File', social_posts: 'Post', contacts: 'Contact', ideas: 'Idea', notes: 'Note', project_stages: 'Stage', interactions: 'Interaction', pages: 'Page', opportunities: 'Opportunity', artworks: 'Artwork', application_kit: 'Application text', tags: 'Tag', inbox_items: 'Inbox item' };
const daysLeft = (iso: string) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(iso)) / 864e5));

export function TrashSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const list = useQuery({ queryKey: ['trash'], queryFn: async () => { const { data, error } = await supabase.rpc('trash_list'); if (error) throw error; return (data as Row[]).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)); } });
  const kinds = useMemo(() => [...new Set((list.data ?? []).map((r) => r.table_name))], [list.data]);
  const rows = (list.data ?? []).filter((r) => !filter || r.table_name === filter);
  async function restore(r: Row) {
    const { error } = await supabase.from(r.table_name).update({ deleted_at: null }).eq('id', r.id);
    if (error) return toast.fail(error);
    toast.ok(`${LABEL[r.table_name] ?? 'Record'} restored ✦`); qc.invalidateQueries();
  }
  async function purge(r: Row) {
    const { error } = await supabase.from(r.table_name).delete().eq('id', r.id);
    if (error) return toast.fail(error);
    toast.ok('Deleted forever'); qc.invalidateQueries({ queryKey: ['trash'] });
  }
  return (
    <section className="glass panel" id="trash" style={{ display: 'grid', gap: 12 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <h2>Trash</h2>
        {kinds.length > 1 && <select id="trash-k" className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter"><option value="">All ({list.data?.length})</option>{kinds.map((k) => <option key={k} value={k}>{LABEL[k] ?? k}</option>)}</select>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Deleted items wait here for 30 days, then they’re removed for good.</p>
      {list.isLoading && <p className="small muted">Loading…</p>}
      {list.data?.length === 0 && <p className="small muted">The trash is empty.</p>}
      <div className="bk-list trash-list">
        {rows.slice(0, 200).map((r) => (
          <div key={r.table_name + r.id} className="bk-row">
            <div className="bk-main"><b>{r.title}</b><span className="small muted">{LABEL[r.table_name] ?? r.table_name} · {daysLeft(r.deleted_at)} days left</span></div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-glass btn-sm" onClick={() => restore(r)}><ArchiveRestore size={13} />Restore</button>
              <ConfirmButton className="btn btn-ghost btn-sm" label={<><Trash2 size={13} />Delete forever</>} confirmText="Delete forever?" onConfirm={() => purge(r)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
