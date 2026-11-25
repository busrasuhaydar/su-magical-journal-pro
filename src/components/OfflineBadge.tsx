// Üstte küçük çevrimdışı göstergesi + bekleyen yazma sayısı; çakışmada kullanıcıya sorar.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw, Check, X } from 'lucide-react';
import { drain, offlineState, type Conflict } from '../lib/offline';
import { Dialog, useToast } from './ui';

const TABLE_LABEL: Record<string, string> = { tasks: 'task', pages: 'page', page_blocks: 'page block', projects: 'project', contacts: 'contact', ideas: 'idea', notes: 'note', opportunities: 'opportunity', artworks: 'artwork', journal_days: 'journal' };

export function OfflineBadge() {
  const qc = useQueryClient();
  const toast = useToast();
  const [st, setSt] = useState(offlineState);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { pending: number; online: boolean; draining: boolean; conflict?: Conflict; error?: string; synced?: number };
      setSt({ pending: d.pending, online: d.online, draining: d.draining });
      if (d.conflict) setConflict(d.conflict);
      if (d.error) toast.fail(new Error(d.error));
      if (d.synced) { qc.invalidateQueries(); toast.ok(`${d.synced} offline change${d.synced > 1 ? 's' : ''} synced ✦`); }
    };
    const net = () => setSt(offlineState());
    window.addEventListener('su-offline', on); window.addEventListener('online', net); window.addEventListener('offline', net);
    return () => { window.removeEventListener('su-offline', on); window.removeEventListener('online', net); window.removeEventListener('offline', net); };
  }, [qc, toast]);
  const answer = (mine: boolean) => { conflict?.resolve(mine); setConflict(null); };
  if (st.online && !st.pending && !conflict) return null;
  const name = conflict ? String(conflict.server?.title ?? conflict.server?.name ?? '') : '';
  return (
    <>
      <button type="button" className={`off-badge${st.online ? ' sync' : ''}`} onClick={() => void drain()} title={st.online ? 'Send pending changes' : 'You’re offline. Changes are saved on this device.'}>
        {st.online ? <RefreshCw size={13} className={st.draining ? 'spin' : ''} /> : <CloudOff size={13} />}
        <span>{st.online ? 'Syncing' : 'Offline'}{st.pending ? ` · ${st.pending}` : ''}</span>
      </button>
      {conflict && (
        <Dialog title="This record changed elsewhere" onClose={() => answer(true)}>
          <p className="small" style={{ marginTop: 0 }}>While you were offline, this {TABLE_LABEL[conflict.item.table ?? ''] ?? 'record'}{name ? ` (“${name}”)` : ''} was also changed on another device. Which version should stay?</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => answer(true)}><Check size={15} />Keep my offline change</button>
            <button type="button" className="btn btn-glass" onClick={() => answer(false)}><X size={15} />Keep the other version</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
