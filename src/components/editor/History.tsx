// Sayfa geçmişi: change_log'dan sürümler (2 dk'dan uzun aralarla gruplanır); eski sürümü görüntüle ve geri yükle.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Eye, History as HistoryIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ChangeLogRow, PageBlock } from '../../lib/types';
import { Dialog, useToast } from '../ui';
import { renderInline } from './inline';
import { apiRef } from './BlockEditor';

type Snap = { title: string | null; blocks: PageBlock[] };
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function snapshotAt(rows: ChangeLogRow[], pageId: string, at: string): Snap {
  let title: string | null = null;
  const blocks = new Map<string, PageBlock | null>();
  for (const r of rows) {
    if (r.at > at) break;
    if (r.table_name === 'pages' && r.row_id === pageId && r.after) title = String(r.after.title ?? title);
    if (r.table_name === 'page_blocks') blocks.set(r.row_id, r.op === 'DELETE' ? null : (r.after as unknown as PageBlock));
  }
  return { title, blocks: [...blocks.values()].filter(Boolean).sort((a, b) => a!.position - b!.position) as PageBlock[] };
}

export function HistoryButton({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><HistoryIcon size={13} />History</button>
      {open && <HistoryDialog pageId={pageId} onClose={() => setOpen(false)} />}
    </>
  );
}

function HistoryDialog({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const log = useQuery({ queryKey: ['page-history', pageId], queryFn: async () => {
    const [a, b] = await Promise.all([
      supabase.from('change_log').select('*').eq('table_name', 'pages').eq('row_id', pageId).order('at').limit(500),
      supabase.from('change_log').select('*').eq('table_name', 'page_blocks').or(`after->>page_id.eq.${pageId},before->>page_id.eq.${pageId}`).order('at').limit(3000),
    ]);
    if (a.error) throw a.error; if (b.error) throw b.error;
    return [...(a.data as ChangeLogRow[]), ...(b.data as ChangeLogRow[])].sort((x, y) => x.at.localeCompare(y.at));
  } });
  // Sürümler: değişiklik oturumlarının sonu (aralarında 2 dk'dan fazla boşluk)
  const versions = useMemo(() => {
    const rows = log.data ?? [], out: { at: string; n: number }[] = [];
    rows.forEach((r, i) => {
      const next = rows[i + 1];
      const cur = out.at(-1);
      if (cur && Date.parse(r.at) - Date.parse(cur.at) < 120_000 && !cur.at.startsWith('!')) { cur.at = r.at; cur.n++; } else out.push({ at: r.at, n: 1 });
      void next;
    });
    return out.reverse();
  }, [log.data]);
  const snap = sel && log.data ? snapshotAt(log.data, pageId, sel) : null;

  async function restore() {
    if (!snap || !sel) return;
    setBusy(true);
    try {
      apiRef.get(pageId)?.flush();
      const { data: cur, error } = await supabase.from('page_blocks').select('id').eq('page_id', pageId);
      if (error) throw error;
      const keep = new Set(snap.blocks.map((b) => b.id));
      const drop = (cur ?? []).map((r) => r.id).filter((id) => !keep.has(id));
      if (drop.length) { const r = await supabase.from('page_blocks').delete().in('id', drop); if (r.error) throw r.error; }
      if (snap.blocks.length) {
        const rows = snap.blocks.map((b) => ({ id: b.id, page_id: pageId, type: b.type, content: b.content, file_id: b.file_id, task_id: b.task_id, ref_page_id: b.ref_page_id, position: b.position }));
        const r = await supabase.from('page_blocks').upsert(rows, { onConflict: 'id' }); if (r.error) throw r.error;
      }
      if (snap.title) await supabase.from('pages').update({ title: snap.title }).eq('id', pageId);
      qc.invalidateQueries({ queryKey: ['blocks', pageId] }); qc.invalidateQueries({ queryKey: ['pages'] }); qc.invalidateQueries({ queryKey: ['page-history', pageId] });
      toast.ok(`Restored the version from ${fmt(sel)} ✦`);
      onClose();
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }

  return (
    <Dialog title="Page history" onClose={onClose} wide>
      <div className="hist">
        <div className="hist-list">
          {log.isLoading && <p className="small muted">Loading…</p>}
          {!log.isLoading && versions.length === 0 && <p className="small muted">No earlier versions yet.</p>}
          {versions.map((v, i) => (
            <button type="button" key={v.at} className={`hist-v${sel === v.at ? ' on' : ''}`} onClick={() => setSel(v.at)}>
              <Eye size={13} /><span><b>{fmt(v.at)}</b>{i === 0 ? ' · current' : ''}<small>{v.n} change{v.n > 1 ? 's' : ''}</small></span>
            </button>
          ))}
        </div>
        <div className="hist-prev">
          {!snap ? <p className="small muted">Choose a version to view it.</p> : (
            <>
              <h3 style={{ marginTop: 0 }}>{snap.title}</h3>
              {snap.blocks.length === 0 && <p className="small muted">Empty page.</p>}
              {snap.blocks.map((b) => <PreviewBlock key={b.id} b={b} />)}
            </>
          )}
        </div>
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" disabled={!snap || busy || sel === versions[0]?.at} onClick={restore}><ArchiveRestore size={15} />{busy ? 'Restoring…' : 'Restore this version'}</button>
      </div>
    </Dialog>
  );
}

function PreviewBlock({ b }: { b: PageBlock }) {
  const t = b.content.text ?? '';
  switch (b.type) {
    case 'h1': return <h2 className="hp-h">{t}</h2>;
    case 'h2': return <h3 className="hp-h">{t}</h3>;
    case 'h3': return <h4 className="hp-h">{t}</h4>;
    case 'bullet': return <p className="hp-li">• {renderInline(t)}</p>;
    case 'numbered': return <p className="hp-li">– {renderInline(t)}</p>;
    case 'todo': return <p className="hp-li">{b.content.checked ? '☑' : '☐'} {renderInline(t)}</p>;
    case 'quote': return <blockquote className="quote">{renderInline(t)}</blockquote>;
    case 'callout': return <p className="callout"><span>✦</span>{renderInline(t)}</p>;
    case 'divider': return <hr className="divider" />;
    case 'text': return <p className="hp-p">{renderInline(t)}</p>;
    default: return <p className="small muted">[{b.type}] {b.content.title ?? ''}</p>;
  }
}
