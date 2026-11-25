// "Buraya bağlananlar": bu sayfaya [[bağlantı]] veren sayfalar ve elle bağlanan kayıtlar (entity_links).
import { Link } from 'react-router-dom';
import { ArrowUpLeft } from 'lucide-react';
import { pageHref, useAllPages, useEntityLinks, useProjects, useTasks } from '../../lib/data';
import { formatRelative } from '../../lib/dates';
import { useEditors } from '../Editors';

export function Backlinks({ pageId }: { pageId: string }) {
  const links = useEntityLinks();
  const pages = useAllPages();
  const projects = useProjects();
  const tasks = useTasks();
  const { openTask } = useEditors();
  const mine = (links.data ?? []).filter((l) => l.to_type === 'page' && l.to_id === pageId);
  const seen = new Set<string>();
  const items = mine.flatMap((l) => {
    const key = `${l.from_type === 'page_mention' ? 'page' : l.from_type}:${l.from_id}`;
    if (seen.has(key)) return []; seen.add(key);
    if (l.from_type === 'page' || l.from_type === 'page_mention') {
      const pg = pages.data?.find((p) => p.id === l.from_id); if (!pg) return [];
      const proj = projects.data?.find((p) => p.id === pg.project_id);
      return [<Link key={key} className="bl-item" to={pageHref(pg, projects.data)}><ArrowUpLeft size={13} />{pg.journal_day ? `📔 Journal · ${formatRelative(pg.journal_day)}` : `${pg.icon ?? '📄'} ${pg.title}`}{proj && <small>{proj.title}</small>}</Link>];
    }
    if (l.from_type === 'project') { const p = projects.data?.find((x) => x.id === l.from_id); return p ? [<Link key={key} className="bl-item" to={`/projects/${p.slug}`}><ArrowUpLeft size={13} />{p.icon ?? '✦'} {p.title}<small>Project</small></Link>] : []; }
    if (l.from_type === 'task') { const t = tasks.data?.find((x) => x.id === l.from_id); return t ? [<button type="button" key={key} className="bl-item" onClick={() => openTask(t)}><ArrowUpLeft size={13} />{t.title}<small>Task</small></button>] : []; }
    return [];
  });
  return (
    <div className="backlinks">
      <b className="small">Linked here</b>
      {items.length ? <div className="bl-list">{items}</div> : <p className="small muted" style={{ margin: '4px 0 0' }}>No pages link here yet. Type <kbd className="kbd">[[</kbd> in any page to link one.</p>}
    </div>
  );
}
