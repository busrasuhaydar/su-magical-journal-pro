// Sol menüde / içindekiler sayfasında: favoriler ve son açılanlar.
import { Link } from 'react-router-dom';
import { Clock3, Star } from 'lucide-react';
import { useFavorites, useRecentItems } from '../lib/ui';

export function QuickLinks({ onNavigate, compact }: { onNavigate?: () => void; compact?: boolean }) {
  const fav = useFavorites();
  const recent = useRecentItems().filter((r) => !fav.isFav(r.id)).slice(0, compact ? 4 : 5);
  if (!fav.list.length && !recent.length) return null;
  return (
    <div className={`qlinks${compact ? ' compact' : ''}`}>
      {fav.list.length > 0 && <>
        <span className="cr-cap"><Star size={11} /> Favorites</span>
        {fav.list.map((f) => <Link key={f.id} to={f.href} onClick={onNavigate} className="ql" title={f.label}><span className="ql-i">{f.icon ?? '★'}</span><span className="ql-t">{f.label}</span></Link>)}
      </>}
      {recent.length > 0 && <>
        <span className="cr-cap"><Clock3 size={11} /> Recently opened</span>
        {recent.map((f) => <Link key={f.id} to={f.href} onClick={onNavigate} className="ql" title={f.label}><span className="ql-i">{f.icon ?? '•'}</span><span className="ql-t">{f.label}</span></Link>)}
      </>}
    </div>
  );
}
