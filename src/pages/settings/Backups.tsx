// Otomatik yedekleme: haftalık yedekler (pg_cron) + "şimdi yedekle", yedek listesi, indir, geri yükle, Google Drive bağlantısı.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, CloudUpload, DatabaseBackup, Download, HardDrive, Link2Off, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { callFunction } from '../../lib/notify';
import { ConfirmButton, formatBytes, useToast } from '../../components/ui';

export interface BackupRec { id: string; storage_path: string; size_bytes: number; row_count: number; tables: Record<string, number>; source: 'manual' | 'cron'; drive_status: string; restored_at: string | null; created_at: string }
const DRIVE_LABEL: Record<string, string> = { uploaded: 'Also on Google Drive', not_configured: 'Storage only', auth_error: 'Drive permission expired', error: 'Drive upload failed' };
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function BackupSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const list = useQuery({ queryKey: ['backups'], queryFn: async () => {
    const { data, error } = await supabase.from('backups').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(30);
    if (error) throw error; return data as BackupRec[];
  } });
  const drive = useQuery({ queryKey: ['backups', 'drive'], retry: 0, queryFn: () => callFunction<{ configured: boolean; connected: boolean; callback: string }>('backup', { action: 'drive_status' }) });
  useEffect(() => { if (new URLSearchParams(location.search).get('drive') === 'connected') toast.ok('Google Drive connected ✦'); }, [toast]);

  async function act<T>(key: string, f: () => Promise<T>, ok?: (r: T) => void) {
    setBusy(key);
    try { const r = await f(); ok?.(r); qc.invalidateQueries({ queryKey: ['backups'] }); } catch (x) { toast.fail(x); } finally { setBusy(''); }
  }
  const backupNow = () => act('now', () => callFunction<BackupRec>('backup', { action: 'backup' }), (r) => toast.ok(`Backup ready · ${r.row_count} records`));
  const restore = (id: string) => act(id, () => callFunction<{ restored: Record<string, number>; errors: Record<string, string> }>('backup', { action: 'restore', id }), (r) => {
    const n = Object.values(r.restored).reduce((a, b) => a + b, 0), bad = Object.keys(r.errors);
    toast.ok(`Restored ${n} records${bad.length ? ` · couldn’t restore: ${bad.join(', ')}` : ''}`);
    qc.invalidateQueries();
  });
  const download = (id: string) => act('dl' + id, () => callFunction<{ url: string }>('backup', { action: 'download', id }), (r) => { window.location.href = r.url; });
  const connect = () => act('drive', () => callFunction<{ url: string }>('backup', { action: 'drive_connect', return_to: `${location.origin}${import.meta.env.BASE_URL}settings` }), (r) => { window.location.href = r.url; });
  const disconnect = () => act('drive', () => callFunction('backup', { action: 'drive_disconnect' }), () => { toast.ok('Google Drive disconnected'); qc.invalidateQueries({ queryKey: ['backups', 'drive'] }); });

  return (
    <section className="glass panel" id="backups" style={{ display: 'grid', gap: 12 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <h2>Backups</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={backupNow} disabled={!!busy}><DatabaseBackup size={14} />{busy === 'now' ? 'Backing up…' : 'Back up now'}</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Every Sunday at 06:00 (Istanbul) all your records are saved as a JSON backup. The last 12 backups are kept.</p>
      <div className="bk-drive">
        <HardDrive size={16} />
        {drive.data?.connected ? <span className="small"><b>Google Drive connected.</b> New backups are also copied to the “Su's Magical Journal Backups” folder.</span>
          : drive.data?.configured ? <span className="small">Google Drive isn’t connected yet.</span>
          : <span className="small muted">Google Drive needs a one-time setup (Google OAuth client). Backups are kept safely in Storage until then.</span>}
        {drive.data?.connected
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect} disabled={!!busy}><Link2Off size={13} />Disconnect</button>
          : <button type="button" className="btn btn-glass btn-sm" onClick={connect} disabled={!!busy || !drive.data?.configured}><CloudUpload size={13} />Connect Google Drive</button>}
      </div>
      {list.isLoading && <p className="small muted">Loading…</p>}
      {list.data?.length === 0 && <p className="small muted">No backups yet. Press “Back up now” to make the first one.</p>}
      <div className="bk-list">
        {list.data?.map((b) => (
          <div key={b.id} className="bk-row">
            <div className="bk-main">
              <b>{fmt(b.created_at)}</b>
              <span className="small muted">{b.source === 'cron' ? 'Weekly' : 'Manual'} · {b.row_count} records · {formatBytes(b.size_bytes)} · {DRIVE_LABEL[b.drive_status] ?? b.drive_status}{b.restored_at ? ` · restored ${fmt(b.restored_at)}` : ''}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => download(b.id)} disabled={!!busy}><Download size={13} />Download</button>
              <ConfirmButton className="btn btn-glass btn-sm" label={busy === b.id ? <><RefreshCw size={13} />Restoring…</> : <><ArchiveRestore size={13} />Restore</>}
                confirmText="Restore this backup? Records in it are written back (newer records stay)." onConfirm={() => restore(b.id)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
