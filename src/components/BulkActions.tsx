// Çoklu seçim çubuğu (görevler ve sayfalar): toplu taşı / sil / durum değiştir.
import type { ReactNode } from 'react';
import { CheckCheck, X } from 'lucide-react';

export function BulkBar({ count, total, onAll, onClear, children }: { count: number; total: number; onAll: () => void; onClear: () => void; children: ReactNode }) {
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
      <b className="small">{count} selected</b>
      <button type="button" className="btn btn-ghost btn-sm" onClick={count === total ? onClear : onAll}><CheckCheck size={13} />{count === total ? 'None' : 'All'}</button>
      <div className="bulk-acts">{children}</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} aria-label="Clear selection"><X size={13} /></button>
    </div>
  );
}
