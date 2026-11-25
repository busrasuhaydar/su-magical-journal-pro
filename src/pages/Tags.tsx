// Etiketler: tüm etiketler ve bir etiketin bağlı olduğu her şey (görev, sayfa, eser, kişi, fırsat, fikir).
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, Palette, Pencil, Trash2 } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Empty, useToast } from '../components/ui';
import { TaskRow } from '../components/TaskRow';
import { pageHref, useAllPages, useContacts, useIdeas, useOpportunities, useProjects, useTasks } from '../lib/data';
import { useArtworks } from '../lib/artworks';
import { TAG_COLORS, TAG_ENTITY_LABEL, useTagLinks, useTags, type TagEntity } from '../lib/tags';
import { supabase } from '../lib/supabase';
import { FavButton } from '../components/FavButton';

export default function TagsPage() {
  const { id } = useParams();
  const tags = useTags(), links = useTagLinks();
  if (id) return <TagDetail id={id} key={id} />;
  const count = (tid: string) => (links.data ?? []).filter((l) => l.tag_id === tid).length;
  return (
    <>
      <PageHead title="Tags" />
      <section className="glass panel">
        {tags.data?.length === 0 && <Empty title="No tags yet">Add tags to tasks, pages, artworks, contacts, opportunities and ideas. Search them with <kbd className="kbd">⌘K</kbd> and <b>#tag</b>.</Empty>}
        <div className="tag-cloud">{tags.data?.map((t) => <Link key={t.id} to={`/tags/${t.id}`} className="tag-chip big" style={{ '--c': t.color } as React.CSSProperties}><span>#{t.name}</span><small>{count(t.id)}</small></Link>)}</div>
      </section>
    </>
  );
}

function TagDetail({ id }: { id: string }) {
  const tags = useTags(), links = useTagLinks();
  const tasks = useTasks(), pages = useAllPages(), projects = useProjects(), arts = useArtworks(), contacts = useContacts(), opps = useOpportunities(), ideas = useIdeas();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const t = tags.data?.find((x) => x.id === id);
  const [name, setName] = useState<string | null>(null);
  if (tags.isLoading) return <p className="muted">Loading…</p>;
  if (!t) return <section className="glass panel"><Empty title="Tag not found"><Link to="/tags">All tags</Link></Empty></section>;
  const ids = (type: TagEntity) => new Set((links.data ?? []).filter((l) => l.tag_id === id && l.entity_type === type).map((l) => l.entity_id));
  const groups: [TagEntity, JSX.Element[]][] = [
    ['task', (tasks.data ?? []).filter((x) => ids('task').has(x.id)).map((x) => <TaskRow key={x.id} task={x} />)],
    ['page', (pages.data ?? []).filter((x) => ids('page').has(x.id)).map((x) => <Link key={x.id} className="bl-item" to={pageHref(x, projects.data)}>{x.icon ?? '📄'} {x.title}</Link>)],
    ['artwork', (arts.data ?? []).filter((x) => ids('artwork').has(x.id)).map((x) => <Link key={x.id} className="bl-item" to={`/artworks/${x.id}`}>🖼️ {x.title}{x.year ? <small>{x.year}</small> : null}</Link>)],
    ['contact', (contacts.data ?? []).filter((x) => ids('contact').has(x.id)).map((x) => <Link key={x.id} className="bl-item" to="/contacts">☺ {x.name}{x.organization ? <small>{x.organization}</small> : null}</Link>)],
    ['opportunity', (opps.data ?? []).filter((x) => ids('opportunity').has(x.id)).map((x) => <Link key={x.id} className="bl-item" to={`/opportunities/${x.id}`}>🏛 {x.title}</Link>)],
    ['idea', (ideas.data ?? []).filter((x) => ids('idea').has(x.id)).map((x) => <Link key={x.id} className="bl-item" to="/ideas">💡 {x.title}</Link>)],
  ];
  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  async function rename() {
    const v = (name ?? '').trim(); setName(null);
    if (!v || v === t!.name) return;
    const { error } = await supabase.from('tags').update({ name: v }).eq('id', id);
    if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['tags'] });
  }
  return (
    <>
      <PageHead title={name !== null ? <input id="tag-name" className="page-title" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /> : <span style={{ color: t.color }}><Hash size={26} />{t.name}</span>}>
        <FavButton item={{ kind: 'tag', id: t.id, label: `#${t.name}`, icon: '#', href: `/tags/${t.id}` }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setName(t.name)}><Pencil size={13} />Rename</button>
        <label className="bulk-field"><Palette size={13} /><select id="tag-color" className="select" value={t.color} onChange={async (e) => { await supabase.from('tags').update({ color: e.target.value }).eq('id', id); qc.invalidateQueries({ queryKey: ['tags'] }); }} aria-label="Color">{TAG_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <ConfirmButton className="btn btn-ghost btn-sm" label={<><Trash2 size={13} />Delete tag</>} confirmText="Delete this tag? (Records stay.)" onConfirm={async () => { const { error } = await supabase.from('tags').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['tags'] }); nav('/tags'); } }} />
      </PageHead>
      {total === 0 && <section className="glass panel"><Empty title="Nothing tagged yet">Add #{t.name} to a task, page, artwork, contact, opportunity or idea.</Empty></section>}
      {groups.filter(([, l]) => l.length).map(([type, l]) => (
        <section key={type} className="glass panel">
          <div className="panel-head"><h2>{TAG_ENTITY_LABEL[type]}</h2><span className="count">{l.length}</span></div>
          <div className={type === 'task' ? 'task-list' : 'bl-list'}>{l}</div>
        </section>
      ))}
    </>
  );
}
