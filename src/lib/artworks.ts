// Eser envanteri (artworks): künye, fiyat geçmişi, durum, alıcı, proje ve NFT bağı.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type ArtStatus = 'studio' | 'consignment' | 'exhibition' | 'sold';
export interface PricePoint { at: string; price: number; currency: string }
export interface Artwork {
  id: string; title: string; year: number | null; technique: string | null; dimensions: string | null; edition: string | null;
  price: number | null; currency: string; price_history: PricePoint[]; status: ArtStatus; location: string | null;
  buyer_contact_id: string | null; project_id: string | null; file_id: string | null; nft_key: string | null; nft_image: string | null;
  description: string | null; notes: string | null; sold_at: string | null; created_at: string; updated_at: string;
}
export const ART_STATUS_LABEL: Record<ArtStatus, string> = { studio: 'In the studio', consignment: 'On consignment at a gallery', exhibition: 'In an exhibition', sold: 'Sold' };
export const ART_STATUS_SHORT: Record<ArtStatus, string> = { studio: 'Studio', consignment: 'Consignment', exhibition: 'Exhibition', sold: 'Sold' };
export const ART_STATUS_COLOR: Record<ArtStatus, string> = { studio: '#9B6FE0', consignment: '#F28A5C', exhibition: '#1FA9A6', sold: '#2E9E6E' };
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'ETH'];
export const money = (v: number | null | undefined, c: string) => v == null ? '—' : c === 'ETH' ? `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH` : new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v);

export function useArtworks() {
  return useQuery({ queryKey: ['artworks'], queryFn: async () => {
    const { data, error } = await supabase.from('artworks').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(3000);
    if (error) throw error; return data as Artwork[];
  } });
}
