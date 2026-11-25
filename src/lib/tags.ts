// Ortak etiketler (tags + tag_links).
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type TagEntity = 'task' | 'page' | 'artwork' | 'contact' | 'opportunity' | 'idea';
export interface Tag { id: string; name: string; color: string }
export interface TagLink { id: string; tag_id: string; entity_type: TagEntity; entity_id: string; deleted_at: string | null }
export const TAG_COLORS = ['#E2558C', '#1FA9A6', '#F28A5C', '#9B6FE0', '#5AA9E6', '#D4A017', '#2E9E6E'];
export const TAG_ENTITY_LABEL: Record<TagEntity, string> = { task: 'Tasks', page: 'Pages', artwork: 'Artworks', contact: 'Contacts', opportunity: 'Opportunities', idea: 'Ideas' };

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: async () => { const { data, error } = await supabase.from('tags').select('id,name,color').is('deleted_at', null).order('name'); if (error) throw error; return data as Tag[]; } });
}
export function useTagLinks() {
  return useQuery({ queryKey: ['tags', 'links'], queryFn: async () => { const { data, error } = await supabase.from('tag_links').select('id,tag_id,entity_type,entity_id,deleted_at').is('deleted_at', null).limit(10000); if (error) throw error; return data as TagLink[]; } });
}
