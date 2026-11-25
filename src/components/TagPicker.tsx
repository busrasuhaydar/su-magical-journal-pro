// Etiket seçici: kayda etiket ekle/çıkar; yazınca öneri, Enter ile yeni etiket.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { TAG_COLORS, useTagLinks, useTags, type Tag, type TagEntity } from '../lib/tags';
import { useToast } from './ui';

export function TagChip({ t, onRemove }: { t: Tag; onRemove?: () => void }) {
  return (
    <span className="tag-chip" style={{ '--c': t.color } as React.CSSProperties}>
      <Link to={`/tags/${t.id}`} onClick={(e) => e.stopPropagation()}>#{t.name}</Link>
      {onRemove && <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={`Remove tag ${t.name}`}><X size={11} /></button>}
    </span>
  );
}

/** Kayıttaki etiketleri salt okunur gösterir (kartlar için). */
export function TagList({ type, id }: { type: TagEntity; id: string }) {
  const tags = useTags(), links = useTagLinks();
  const mine = (links.data ?? []).filter((l) => l.entity_type === type && l.entity_id === id).map((l) => tags.data?.find((t) => t.id === l.tag_id)).filter(Boolean) as Tag[];
  if (!mine.length) return null;
  return <span className="tag-row">{mine.map((t) => <TagChip key={t.id} t={t} />)}</span>;
}

export function TagPicker({ type, id }: { type: TagEntity; id: string }) {
  const tags = useTags(), links = useTagLinks();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const mineLinks = (links.data ?? []).filter((l) => l.entity_type === type && l.entity_id === id);
  const mine = mineLinks.map((l) => ({ link: l, tag: tags.data?.find((t) => t.id === l.tag_id) })).filter((x) => x.tag) as { link: { id: string }; tag: Tag }[];
  const sugg = useMemo(() => (tags.data ?? []).filter((t) => !mineLinks.some((l) => l.tag_id === t.id) && t.name.toLocaleLowerCase('tr').includes(q.trim().replace(/^#/, '').toLocaleLowerCase('tr'))).slice(0, 8), [tags.data, mineLinks, q]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tags'] }); };
  async function attach(t: Tag) {
    const { error } = await supabase.from('tag_links').upsert({ tag_id: t.id, entity_type: type, entity_id: id, deleted_at: null }, { onConflict: 'tag_id,entity_type,entity_id' });
    if (error) return toast.fail(error);
    setQ(''); refresh();
  }
  async function createAndAttach() {
    const name = q.trim().replace(/^#/, '').slice(0, 60); if (!name) return;
    const ex = tags.data?.find((t) => t.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
    if (ex) return attach(ex);
    const { data, error } = await supabase.from('tags').insert({ name, color: TAG_COLORS[(tags.data?.length ?? 0) % TAG_COLORS.length] }).select('id,name,color').single();
    if (error) return toast.fail(error);
    await attach(data as Tag);
  }
  async function detach(linkId: string) {
    const { error } = await supabase.from('tag_links').delete().eq('id', linkId);
    if (error) toast.fail(error); else refresh();
  }
  return (
    <div className="tag-picker" onClick={(e) => e.stopPropagation()}>
      {mine.map(({ link, tag }) => <TagChip key={link.id} t={tag} onRemove={() => detach(link.id)} />)}
      {open ? (
        <span className="tag-add">
          <Hash size={12} />
          <input id={`tg-${type}-${id}`} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="tag"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (sugg[0] && sugg[0].name.toLocaleLowerCase('tr') === q.trim().replace(/^#/, '').toLocaleLowerCase('tr')) void attach(sugg[0]); else void createAndAttach(); } if (e.key === 'Escape') { setOpen(false); setQ(''); } }}
            onBlur={() => setTimeout(() => { setOpen(false); setQ(''); }, 180)} aria-label="Add tag" />
          {(sugg.length > 0 || q.trim()) && (
            <span className="tag-sugg" role="listbox">
              {sugg.map((t) => <button type="button" key={t.id} onMouseDown={(e) => { e.preventDefault(); void attach(t); }}><Hash size={11} />{t.name}</button>)}
              {q.trim() && !sugg.some((t) => t.name.toLocaleLowerCase('tr') === q.trim().replace(/^#/, '').toLocaleLowerCase('tr')) && <button type="button" onMouseDown={(e) => { e.preventDefault(); void createAndAttach(); }}><Plus size={11} />Create “{q.trim().replace(/^#/, '')}”</button>}
            </span>
          )}
        </span>
      ) : <button type="button" className="tag-addbtn" onClick={() => setOpen(true)}><Plus size={11} />Tag</button>}
    </div>
  );
}
