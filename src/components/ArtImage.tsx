import { ImageOff } from 'lucide-react';
import { useFiles } from '../lib/data';
import type { Artwork } from '../lib/artworks';
import { Thumb } from './Media';

/** Eser görseli: galerideki dosya ya da NFT görseli. */
export function ArtImage({ a, fit = 'cover' }: { a: Pick<Artwork, 'file_id' | 'nft_image' | 'title'>; fit?: 'cover' | 'contain' }) {
  const files = useFiles();
  const f = a.file_id ? files.data?.find((x) => x.id === a.file_id) : undefined;
  if (f) return <Thumb file={f} fit={fit} />;
  if (a.nft_image) return <img src={a.nft_image} alt={a.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />;
  return <div className="art-noimg"><ImageOff size={26} /></div>;
}
