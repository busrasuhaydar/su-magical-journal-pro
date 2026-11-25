import { Star } from 'lucide-react';
import { useFavorites, type NavRef } from '../lib/ui';

/** Yıldız: öğeyi favorilere ekler / çıkarır. */
export function FavButton({ item, small = true }: { item: NavRef; small?: boolean }) {
  const fav = useFavorites();
  const on = fav.isFav(item.id);
  return (
    <button type="button" className={`btn btn-ghost ${small ? 'btn-sm' : ''} fav-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => fav.toggle(item)} title={on ? 'Remove from favorites' : 'Add to favorites'}>
      <Star size={13} fill={on ? 'currentColor' : 'none'} />{on ? 'Favorite' : 'Add to favorites'}
    </button>
  );
}
