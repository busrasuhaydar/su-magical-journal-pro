// Project workspace: kapaklı ana sayfa ve birbirini besleyen bölümler.
import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Compass, Flag, Hourglass, Lightbulb, Pencil, Plus, Sparkles, StickyNote } from 'lucide-react';
import { useEditors } from '../../components/Editors';
import { TaskRow } from '../../components/TaskRow';
import { ConfirmButton, Empty, Field, useToast } from '../../components/ui';
import {
  addToGallery, uploadFile, useIdeas, useMemory, useNotes, useOppDates, useOpportunities, usePages, usePosts, useProgress, useProjectHistory,
  useProjectOpps, useProjects, useRowMutation, useSaveProject, useSaveTask, useStages, useTasks,
} from '../../lib/data';
import { addDays, addMonths, dayKeyOf, daysBetween, formatLong, formatRelative, formatShort, hhmm, minutesOf, monthMatrix, MONTHS, parseKey, startOfMonth, todayKey, WEEKDAYS_SHORT } from '../../lib/dates';
import {
  IDEA_CATEGORY_LABEL, MEMORY_KIND_LABEL, OPP_DATE_LABEL, OPP_STATUS_COLOR, OPP_STATUS_LABEL, PRIORITY_LABEL, PROJECT_ICONS, PROJECT_STATUS_LABEL,
  type FileRec, type Project, type Task, type TaskStatus,
} from '../../lib/types';
import { ProjectEditor } from '../Projects';
import { isCollectionProject, useNfts } from '../../lib/nft';
import { GalleryTab, Thumb, useProjectGallery } from './Gallery';
import { MediaSources } from '../../components/Media';
import { PagesTab } from './Pages';
import { FavButton } from '../../components/FavButton';
import { useTrackRecent } from '../../lib/ui';
import { LinkButton, LinkedIn } from './Links';
import { HistoryTab, MemoryTab, PeopleTab, SocialTab } from './Sections';

const TABS: [string, string][] = [
  ['overview', 'Home'], ['tasks', 'Tasks'], ['gallery', 'Gallery'], ['pages', 'Pages'], ['notes', 'Notes & Ideas'],
  ['timeline', 'Timeline'], ['social', 'Social Media'], ['opportunities', 'Exhibitions & Applications'], ['contacts', 'Contacts'],
  ['hafiza', 'Memory'], ['gecmis', 'History'], ['butce', 'Budget'],
];

export default function ProjectWorkspace() {
  const { slug, tab = 'overview', sub } = useParams();
  const projects = useProjects();
  const p = projects.data?.find((x) => x.slug === slug);
  if (projects.isLoading) return <p className="muted">Loading…</p>;
  if (!p) return <Navigate to="/projects" replace />;
  return <Workspace p={p} tab={TABS.some(([k]) => k === tab) ? tab : 'overview'} sub={sub} />;
}

function Workspace({ p, tab, sub }: { p: Project; tab: string; sub?: string }) {
  const nav = useNavigate();
  useTrackRecent({ kind: 'project', id: p.id, label: p.title, icon: p.icon ?? '✦', href: `/projects/${p.slug}` });
  return (
    <>
      <ProjectHeader p={p} />
      <nav className="ptabs" aria-label="Project sections">
        {TABS.map(([k, l]) => <Link key={k} to={`/projects/${p.slug}/${k}`} className={k === tab ? 'on' : ''}>{l}</Link>)}
      </nav>
      {tab === 'overview' && <Overview p={p} />}
      {tab === 'tasks' && <TasksTab p={p} />}
      {tab === 'gallery' && <GalleryTab p={p} />}
      {tab === 'pages' && <PagesTab p={p} initialPage={sub} onOpenPage={(id) => nav(`/projects/${p.slug}/pages${id ? '/' + id : ''}`)} />}
      {tab === 'notes' && <NotesIdeasTab p={p} />}
      {tab === 'timeline' && <TimelineTab p={p} />}
      {tab === 'social' && <SocialTab p={p} />}
      {tab === 'opportunities' && <ProjectOppsTab p={p} />}
      {tab === 'contacts' && <PeopleTab p={p} />}
      {tab === 'hafiza' && <MemoryTab p={p} />}
      {tab === 'gecmis' && <HistoryTab p={p} />}
      {tab === 'butce' && <section className="glass panel"><Empty title="In Phase 5">Income, expenses and the project budget will come with the finance module.</Empty></section>}
    </>
  );
}

// ── Kapaklı başlık ─────────────────────────────────────
export function ProgressRing({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Progress ${value} percent`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .5s' }} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--f-mono)" fontSize={size / 4.2} fill="var(--ink-900)">%{value}</text>
    </svg>
  );
}

function ProjectHeader({ p }: { p: Project }) {
  const progress = useProgress().data?.get(p.id);
  const gallery = useProjectGallery(p.id);
  const cover = gallery.find((g) => g.file.id === p.cover_file_id)?.file;
  const save = useSaveProject();
  const qc = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const today = todayKey();
  const setField = (patch: Partial<Project>) => save.mutate({ id: p.id, title: p.title, slug: p.slug, ...patch }, { onError: (x) => toast.fail(x) });
  async function uploadCover(input: File[] | FileRec[]) {
    if (!input[0]) return;
    try { const first = input[0]; const rec = first instanceof File ? (await uploadFile(first)).rec : first; await addToGallery(rec.id, p.id); qc.invalidateQueries({ queryKey: ['files'] }); setField({ cover_file_id: rec.id }); toast.ok('Cover image added (it’s also in the gallery)'); }
    catch (x) { toast.fail(x); }
  }
  return (
    <header className="phead glass">
      <div className="pcover" style={{ background: cover ? undefined : `linear-gradient(120deg, ${p.color}55, #FFE3D3 55%, #DDF5F8)` }}>
        {cover && <Thumb file={cover} />}
        <div className="pcover-acts">
          <MediaSources id="cover-in" size="xs" multiple={false} visualOnly accept="image/*" onFiles={uploadCover} onPicked={uploadCover} />
          {cover && <button type="button" className="btn btn-glass btn-sm" onClick={() => setField({ cover_file_id: null })}>Remove</button>}
        </div>
      </div>
      <div className="pinfo">
        <div className="picon-wrap">
          <button type="button" className="picon" style={{ background: `${p.color}22`, borderColor: `${p.color}66` }} onClick={() => setIconOpen(!iconOpen)} aria-label="Change icon">{p.icon ?? '✦'}</button>
          {iconOpen && <div className="icon-grid glass">{PROJECT_ICONS.map((i) => <button type="button" key={i} onClick={() => { setField({ icon: i }); setIconOpen(false); }}>{i}</button>)}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}><Link to="/projects" className="small muted" style={{ textDecoration: 'none' }}>My Projects ›</Link></div>
          <h1 style={{ fontSize: 36 }}>{p.title}</h1>
          {p.description && <p className="muted" style={{ margin: '4px 0 0', maxWidth: '70ch' }}>{p.description}</p>}
          <div className="row small" style={{ marginTop: 10, gap: 10 }}>
            <select id="ph-status" className="chip" value={p.status} onChange={(e) => setField({ status: e.target.value as Project['status'] })} style={{ cursor: 'pointer' }} aria-label="Status">
              {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="muted">Start: <b>{p.start_date ? formatShort(p.start_date) + ' ' + parseKey(p.start_date).y : '—'}</b></span>
            <span className="muted">Goal: <b style={{ color: p.target_date && p.target_date < today && p.status !== 'completed' ? 'var(--bad)' : undefined }}>{p.target_date ? formatShort(p.target_date) + ' ' + parseKey(p.target_date).y : '—'}</b>
              {p.target_date && p.status !== 'completed' && <> · {daysBetween(today, p.target_date) >= 0 ? `${daysBetween(today, p.target_date)} days left` : `${-daysBetween(today, p.target_date)} days overdue`}</>}</span>
            {(progress?.overdue_tasks ?? 0) > 0 && <span className="chip" style={{ color: 'var(--bad)', borderColor: '#F6C1CA' }}><AlertTriangle size={12} />{progress!.overdue_tasks} overdue tasks</span>}
            {isCollectionProject(p) && <CollectionLink slug={p.slug.replace('koleksiyon-', '')} />}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}><Pencil size={13} />Edit</button>
            <FavButton item={{ kind: 'project', id: p.id, label: p.title, icon: p.icon ?? '✦', href: `/projects/${p.slug}` }} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <ProgressRing value={progress?.progress ?? 0} color={p.color} size={84} />
          <div className="small muted">{progress?.done_tasks ?? 0}/{progress?.total_tasks ?? 0} tasks</div>
        </div>
      </div>
      {edit && <ProjectEditor draft={p} onClose={() => setEdit(false)} />}
    </header>
  );
}

// ── Home ──────────────────────────────────────────
function Overview({ p }: { p: Project }) {
  const tasks = useTasks();
  const memory = useMemory(p.id);
  const history = useProjectHistory(p.id);
  const posts = usePosts({ projectId: p.id });
  const stages = useStages(p.id);
  const pages = usePages(p.id);
  const gallery = useProjectGallery(p.id);
  const { openTask } = useEditors();
  const today = todayKey(), in14 = addDays(today, 14), nowIso = new Date().toISOString();
  const mine = (tasks.data ?? []).filter((t) => t.project_id === p.id && t.status !== 'cancelled');
  const open = mine.filter((t) => t.status !== 'done');
  const dayOf = (t: Task) => (t.starts_at ? dayKeyOf(t.starts_at) : t.due_date);
  const overdue = open.filter((t) => (t.ends_at ? t.ends_at < nowIso : !!t.due_date && t.due_date < today));
  const upcoming = open.filter((t) => !overdue.includes(t) && dayOf(t) && dayOf(t)! <= in14).sort((a, b) => dayOf(a)!.localeCompare(dayOf(b)!));
  const waiting = open.filter((t) => !overdue.includes(t) && !upcoming.includes(t));
  const latest = (k: string) => memory.data?.find((m) => m.kind === k && !memory.data.some((o) => o.supersedes === m.id));
  const lastAt = history.data?.[0]?.at;
  const idle = lastAt ? daysBetween(dayKeyOf(lastAt), today) : null;
  const nextMilestone = stages.data?.filter((s) => s.status !== 'done' && s.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
  const nextPost = (posts.data ?? []).find((x) => x.scheduled_at && x.status !== 'published' && dayKeyOf(x.scheduled_at) >= today);
  const decisions = (memory.data ?? []).filter((m) => m.kind === 'decision' && !memory.data!.some((o) => o.supersedes === m.id)).slice(0, 4);

  return (
    <div className="pov">
      <section className="glass panel pov-progress">
        <div className="panel-head"><h2>Progress</h2><button type="button" className="btn btn-primary btn-sm" onClick={() => openTask({ project_id: p.id })}><Plus size={13} />Task</button></div>
        <div className="stat-row">
          <div className="stat"><b style={{ color: 'var(--bad)' }}>{overdue.length}</b><span>Overdue</span></div>
          <div className="stat"><b style={{ color: 'var(--orange-600)' }}>{upcoming.length}</b><span>Within 14 days</span></div>
          <div className="stat"><b>{waiting.length}</b><span>Pending</span></div>
          <div className="stat"><b style={{ color: 'var(--ok)' }}>{mine.length - open.length}</b><span>Completed</span></div>
        </div>
        {overdue.length > 0 && <><h3 className="row" style={{ gap: 6, margin: '16px 0 8px', color: 'var(--bad)' }}><AlertTriangle size={16} />Overdue</h3><div className="task-list">{overdue.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} overdue />)}</div></>}
        {upcoming.length > 0 && <><h3 className="row" style={{ gap: 6, margin: '16px 0 8px' }}><CalendarClock size={16} />Upcoming</h3><div className="task-list">{upcoming.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} />)}</div></>}
        {waiting.length > 0 && <><h3 className="row" style={{ gap: 6, margin: '16px 0 8px' }}><Hourglass size={16} />Pending items</h3><div className="task-list">{waiting.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} />)}</div>{waiting.length > 4 && <Link className="small" to={`/projects/${p.slug}/tasks`}>+{waiting.length - 4} more tasks</Link>}</>}
        {mine.length === 0 && <Empty title="No tasks">Add the first task; progress is calculated automatically and shows in your calendar.</Empty>}
      </section>

      <section className="glass panel pov-memory" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <h2 className="row" style={{ gap: 8 }}><Compass size={20} color="var(--rose-500)" />Where did you leave off?</h2>
        <Line label="Last worked on">{lastAt ? `${formatRelative(dayKeyOf(lastAt))}${idle! > 1 ? ` · ${idle} days ago` : ''}` : 'No records'}</Line>
        {idle != null && idle >= 21 && <div className="card small" style={{ borderColor: 'var(--orange-500)' }}>No activity on this project for {idle} days.</div>}
        <Line label="Latest state">{latest('state')?.body ?? 'No records'}</Line>
        <Line label="Next step">{latest('next_step')?.body ?? (upcoming[0] ? `No recorded step · nearest task: ${upcoming[0].title}` : 'No records')}</Line>
        <Line label="Milestone">{nextMilestone ? `${nextMilestone.title} · ${formatRelative(nextMilestone.due_date!)}` : 'No records'}</Line>
        <Line label="Upcoming post">{nextPost ? `${nextPost.title} · ${formatRelative(dayKeyOf(nextPost.scheduled_at!))} ${hhmm(minutesOf(nextPost.scheduled_at!))}` : 'No scheduled post'}</Line>
        <div><b className="small">Decisions</b>{decisions.length ? <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{decisions.map((d) => <li key={d.id}>{d.body}</li>)}</ul> : <p className="small muted" style={{ margin: '2px 0 0' }}>No records · <Link to={`/projects/${p.slug}/hafiza`}>add to memory</Link></p>}</div>
      </section>

      <section className="glass panel pov-gallery">
        <div className="panel-head"><h2>Gallery</h2><Link className="small" to={`/projects/${p.slug}/gallery`}>All ({gallery.length}) →</Link></div>
        {gallery.length === 0 ? <p className="small muted">No images yet. <Link to={`/projects/${p.slug}/gallery`}>Add some</Link>.</p> : (
          <div className="strip">{gallery.slice(0, 8).map((g) => <Link key={g.link.id} to={`/projects/${p.slug}/gallery`} className="strip-item"><Thumb file={g.file} /></Link>)}</div>
        )}
      </section>

      <section className="glass panel pov-pages">
        <div className="panel-head"><h2>Pages</h2><Link className="small" to={`/projects/${p.slug}/pages`}>Open →</Link></div>
        {(pages.data ?? []).filter((x) => !x.parent_id).length === 0 ? <p className="small muted">Ideas, research, meeting notes… <Link to={`/projects/${p.slug}/pages`}>Create the first page</Link>.</p> : (
          <div className="page-cards">{(pages.data ?? []).filter((x) => !x.parent_id).map((pg) => (
            <Link key={pg.id} to={`/projects/${p.slug}/pages/${pg.id}`} className="page-card"><span className="pc-ico">{pg.icon ?? '📄'}</span><b>{pg.title}</b><span className="small muted">{(pages.data ?? []).filter((c) => c.parent_id === pg.id).length} subpages · {formatRelative(dayKeyOf(pg.updated_at))}</span></Link>
          ))}</div>
        )}
      </section>
      <div className="pov-linked"><LinkedIn p={p} /></div>
    </div>
  );
}
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 10, fontSize: 14 }}><span className="muted small" style={{ paddingTop: 2 }}>{label}</span><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</span></div>;
}

// ── Tasks: List / Kanban / Calendar, alt görevlerle ───
const COLS: [TaskStatus, string, string][] = [['todo', 'To do', 'var(--rose-300)'], ['doing', 'In progress', 'var(--orange-500)'], ['done', 'Completed', 'var(--ok)']];
function TasksTab({ p }: { p: Project }) {
  const tasks = useTasks();
  const save = useSaveTask();
  const { openTask } = useEditors();
  const toast = useToast();
  const [view, setView] = useState<'list' | 'kanban' | 'calendar'>(() => { try { return (localStorage.getItem('ptask-view') as 'list') || 'kanban'; } catch { return 'kanban'; } });
  const [over, setOver] = useState<string | null>(null);
  const [month, setMonth] = useState(startOfMonth(todayKey()));
  const [quick, setQuick] = useState('');
  const setV = (v: typeof view) => { setView(v); try { localStorage.setItem('ptask-view', v); } catch { /* yok say */ } };
  const mine = (tasks.data ?? []).filter((t) => t.project_id === p.id && t.status !== 'cancelled');
  const top = mine.filter((t) => !t.parent_task_id || !mine.some((x) => x.id === t.parent_task_id));
  const subs = (id: string) => mine.filter((t) => t.parent_task_id === id);
  async function moveTo(t: Task, status: TaskStatus) {
    if (t.status === status) return;
    try { await save.mutateAsync({ id: t.id, title: t.title, status, completed_at: status === 'done' ? new Date().toISOString() : null }); if (status === 'done') toast.ok('Completed · project progress updated'); }
    catch (x) { toast.fail(x); }
  }
  const col = (s: TaskStatus) => top.filter((t) => (s === 'todo' ? t.status === 'todo' || t.status === 'postponed' : t.status === s));
  const dayOf = (t: Task) => (t.starts_at ? dayKeyOf(t.starts_at) : t.due_date);
  const { y, m } = parseKey(month);
  const today = todayKey();
  return (
    <section className="glass panel" style={{ display: 'grid', gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seg">{([['kanban', 'Kanban'], ['list', 'List'], ['calendar', 'Calendar']] as const).map(([k, l]) => <button type="button" key={k} className={view === k ? 'on' : ''} onClick={() => setV(k)}>{l}</button>)}</div>
        <form className="row" onSubmit={async (e) => { e.preventDefault(); if (!quick.trim()) return; try { await save.mutateAsync({ title: quick.trim(), project_id: p.id }); setQuick(''); } catch (x) { toast.fail(x); } }}>
          <input id="pt-quick" className="input" style={{ width: 240 }} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quickly add a task and press Enter" />
          <button type="button" className="btn btn-primary" onClick={() => openTask({ project_id: p.id })}><Plus size={15} />Details</button>
        </form>
      </div>
      {mine.length === 0 && <Empty title="No tasks">Add the first task to this project; it also shows in your calendar.</Empty>}

      {view === 'kanban' && mine.length > 0 && (
        <div className="kanban">
          {COLS.map(([s, l, c]) => (
            <div key={s} className={`kcol${over === s ? ' over' : ''}`} onDragOver={(e: DragEvent) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
              onDrop={(e: DragEvent) => { e.preventDefault(); setOver(null); const t = mine.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (t) moveTo(t, s); }}>
              <div className="kcol-head"><i className="dot" style={{ background: c }} /><b>{l}</b><span className="count">{col(s).length}</span></div>
              {col(s).map((t) => {
                const ss = subs(t.id), sd = ss.filter((x) => x.status === 'done').length;
                return (
                  <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="kcard" onClick={() => openTask(t)} role="button" tabIndex={0}>
                    <b style={{ textDecoration: s === 'done' ? 'line-through' : undefined }}>{t.title}</b>
                    <div className="meta small muted row" style={{ gap: 8 }}>
                      <span className="row" style={{ gap: 4 }}><i className={`dot p-${t.priority}`} />{PRIORITY_LABEL[t.priority]}</span>
                      {dayOf(t) && <span style={{ color: dayOf(t)! < today && s !== 'done' ? 'var(--bad)' : undefined }}>{formatRelative(dayOf(t)!)}</span>}
                      {ss.length > 0 && <span className="row" style={{ gap: 3 }}><Check size={11} />{sd}/{ss.length}</span>}
                    </div>
                    {ss.length > 0 && <div className="prog" style={{ marginTop: 6, height: 4 }}><b style={{ width: `${(sd / ss.length) * 100}%` }} /></div>}
                    <select id={`ks-${t.id}`} className="ksel" value={t.status === 'postponed' ? 'todo' : t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => moveTo(t, e.target.value as TaskStatus)} aria-label="Status">
                      {COLS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div className="task-list">
          {top.sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || (dayOf(a) ?? '9').localeCompare(dayOf(b) ?? '9')).map((t) => (
            <div key={t.id} style={{ display: 'grid', gap: 4 }}>
              <TaskRow task={t} />
              {subs(t.id).map((s) => <div key={s.id} style={{ marginLeft: 28 }}><TaskRow task={s} /></div>)}
            </div>
          ))}
        </div>
      )}

      {view === 'calendar' && (
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" className="btn btn-glass icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <h3>{MONTHS[m]} {y}</h3>
            <button type="button" className="btn btn-glass icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
          <div className="month-grid">
            {WEEKDAYS_SHORT.map((w) => <div key={w} className="wd">{w}</div>)}
            {monthMatrix(y, m).map((k, i) => (
              <div key={k ?? 'x' + i} className={`mcell${!k ? ' out' : ''}${k === today ? ' today' : ''}`} onClick={() => k && openTask({ project_id: p.id, due_date: k })} style={{ minHeight: 90 }}>
                {k && <span className="num">{parseKey(k).d}</span>}
                {k && mine.filter((t) => dayOf(t) === k).map((t) => <span key={t.id} className={`pill task${t.status === 'done' ? ' done' : ''}`} onClick={(e) => { e.stopPropagation(); openTask(t); }}>{t.title}</span>)}
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>These tasks also appear in your main calendar as the same record. Click an empty day to add a task to it.</p>
        </div>
      )}
    </section>
  );
}

// ── Zaman çizelgesi: kilometre taşları + kronolojik akış ─
function TimelineTab({ p }: { p: Project }) {
  const stages = useStages(p.id);
  const tasks = useTasks();
  const memory = useMemory(p.id);
  const posts = usePosts({ projectId: p.id });
  const gallery = useProjectGallery(p.id);
  const oppLinks = useProjectOpps();
  const opps = useOpportunities();
  const oppDates = useOppDates();
  const mut = useRowMutation('project_stages', ['stages']);
  const toast = useToast();
  const [f, setF] = useState({ title: '', due_date: '', kind: 'milestone' as 'stage' | 'milestone', description: '' });
  const today = todayKey();
  type Ev = { k: string; label: string; sub: string; icon: string; future: boolean; done?: boolean; id?: string };
  const myOpps = new Set((oppLinks.data ?? []).filter((l) => l.project_id === p.id).map((l) => l.opportunity_id));
  const events: Ev[] = useMemo(() => [
    ...(stages.data ?? []).filter((s) => s.due_date).map((s) => ({ k: s.due_date!, label: s.title, sub: s.kind === 'milestone' ? 'Milestone' : 'Stage', icon: s.kind === 'milestone' ? '🏁' : '◆', future: s.status !== 'done', done: s.status === 'done', id: s.id })),
    ...(tasks.data ?? []).filter((t) => t.project_id === p.id && t.status === 'done' && t.completed_at).map((t) => ({ k: dayKeyOf(t.completed_at!), label: t.title, sub: 'Task completed', icon: '✓', future: false })),
    ...(memory.data ?? []).map((m) => ({ k: m.decided_on, label: m.body.split('\n')[0].slice(0, 90), sub: MEMORY_KIND_LABEL[m.kind], icon: '✎', future: false })),
    ...(posts.data ?? []).filter((x) => x.scheduled_at).map((x) => ({ k: dayKeyOf(x.published_at ?? x.scheduled_at!), label: x.title, sub: x.status === 'published' ? 'Published' : 'Scheduled post', icon: '✦', future: x.status !== 'published' })),
    ...gallery.map((g) => ({ k: dayKeyOf(g.link.created_at), label: g.link.caption || g.file.title, sub: 'Added to gallery', icon: '🖼', future: false })),
    ...(oppDates.data ?? []).filter((d) => myOpps.has(d.opportunity_id)).map((d) => ({ k: d.day, label: opps.data?.find((o) => o.id === d.opportunity_id)?.title ?? '', sub: OPP_DATE_LABEL[d.kind], icon: '🏛', future: d.day >= today })),
    ...(p.target_date ? [{ k: p.target_date, label: 'Project target date', sub: p.title, icon: '🎯', future: p.target_date >= today }] : []),
    ...(p.start_date ? [{ k: p.start_date, label: 'Project started', sub: p.title, icon: '🌱', future: p.start_date > today }] : []),
  ].sort((a, b) => b.k.localeCompare(a.k)), [stages.data, tasks.data, memory.data, posts.data, gallery, oppDates.data, opps.data, myOpps, p, today]);
  const future = events.filter((e) => e.k >= today).reverse(), past = events.filter((e) => e.k < today);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.due_date) return toast.fail(new Error('Enter a title and date.'));
    try { await mut.mutateAsync({ op: 'insert', row: { project_id: p.id, title: f.title.trim(), due_date: f.due_date, kind: f.kind, description: f.description.trim() || null, position: (stages.data?.length ?? 0) + 1 } }); setF({ ...f, title: '', description: '' }); toast.ok('Added · also visible in the calendar'); }
    catch (x) { toast.fail(x); }
  }
  const Row = ({ e }: { e: Ev }) => (
    <div className={`tl-row${e.future ? ' future' : ''}${e.done ? ' done' : ''}`}>
      <span className="tl-date">{formatShort(e.k)}<br /><span className="small muted">{parseKey(e.k).y}</span></span>
      <span className="tl-dot">{e.icon}</span>
      <div className="tl-body"><b>{e.label}</b><span className="small muted">{e.sub}{e.k === today ? ' · today' : ''}</span></div>
      {e.id && (
        <span className="row" style={{ gap: 4 }}>
          <button type="button" className={`check${e.done ? ' on' : ''}`} aria-label="Completed" onClick={() => mut.mutate({ op: 'update', id: e.id!, row: { status: e.done ? 'todo' : 'done' } })}>{e.done && <Check size={13} strokeWidth={3} />}</button>
          <ConfirmButton label="Delete" className="btn btn-ghost btn-sm" confirmText="Delete?" onConfirm={() => mut.mutate({ op: 'delete', id: e.id! })} />
        </span>
      )}
    </div>
  );
  return (
    <div className="day-grid">
      <section className="glass panel">
        <h2 className="row" style={{ gap: 8, marginBottom: 12 }}><Flag size={18} />Upcoming</h2>
        {future.length === 0 ? <p className="small muted">No planned milestones.</p> : <div className="timeline">{future.map((e, i) => <Row key={'f' + i} e={e} />)}</div>}
        <h2 className="row" style={{ gap: 8, margin: '22px 0 12px' }}><Sparkles size={18} />Past developments</h2>
        {past.length === 0 ? <p className="small muted">No past records yet.</p> : <div className="timeline">{past.slice(0, 80).map((e, i) => <Row key={'p' + i} e={e} />)}</div>}
      </section>
      <section className="glass panel">
        <form onSubmit={add} style={{ display: 'grid', gap: 10 }}>
          <h3>Add milestone / stage</h3>
          <div className="seg"><button type="button" className={f.kind === 'milestone' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'milestone' })}>Milestone</button><button type="button" className={f.kind === 'stage' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'stage' })}>Stage</button></div>
          <Field label="Title"><input id="ms-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Prototype completed" /></Field>
          <Field label="Date"><input id="ms-date" type="date" className="input" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label="Description"><textarea id="ms-desc" className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <button className="btn btn-primary" disabled={mut.isPending}>Add</button>
        </form>
        <p className="small muted">The timeline automatically collects completed tasks, memory records, posts, gallery additions and application dates.</p>
      </section>
    </div>
  );
}

// ── Notes ve fikirler (hızlı yakalama) ────────────────
function NotesIdeasTab({ p }: { p: Project }) {
  const notes = useNotes(p.id);
  const ideas = useIdeas();
  const tasks = useTasks();
  const mut = useRowMutation('notes', ['notes']);
  const ideaMut = useRowMutation('ideas', ['ideas']);
  const toast = useToast();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'note' | 'reference' | 'idea'>('note');
  const [url, setUrl] = useState('');
  const projIdeas = (ideas.data ?? []).filter((i) => i.project_id === p.id || i.converted_project_id === p.id);
  async function capture(e: FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    const [first, ...rest] = t.split('\n');
    try {
      if (kind === 'idea') await ideaMut.mutateAsync({ op: 'insert', row: { title: first.slice(0, 200), body: rest.join('\n').trim() || null, project_id: p.id, category: 'art' } });
      else { let u = url.trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; await mut.mutateAsync({ op: 'insert', row: { project_id: p.id, kind, title: first.slice(0, 200), body: rest.join('\n').trim() || null, url: u || null } }); }
      setText(''); setUrl('');
    } catch (x) { toast.fail(x); }
  }
  const projTasks = (tasks.data ?? []).filter((t) => t.project_id === p.id && t.status !== 'cancelled');
  return (
    <div style={{ display: 'grid', gap: 'var(--s5)' }}>
      <form className="glass panel capture" onSubmit={capture}>
        <div className="seg">
          <button type="button" className={kind === 'note' ? 'on' : ''} onClick={() => setKind('note')}><StickyNote size={13} /> Note</button>
          <button type="button" className={kind === 'idea' ? 'on' : ''} onClick={() => setKind('idea')}><Lightbulb size={13} /> Idea</button>
          <button type="button" className={kind === 'reference' ? 'on' : ''} onClick={() => setKind('reference')}>Reference</button>
        </div>
        <textarea id="cap-text" className="textarea" style={{ minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) capture(e as unknown as FormEvent); }} placeholder="Write what’s on your mind… (first line becomes the title · save with ⌘+Enter)" />
        {kind === 'reference' && <input id="cap-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (optional)" />}
        <button className="btn btn-primary" style={{ justifySelf: 'start' }}>Save</button>
      </form>
      <div className="masonry">
        {projIdeas.map((i) => (
          <div key={i.id} className="glass note-card idea">
            <span className="chip"><Lightbulb size={11} />{IDEA_CATEGORY_LABEL[i.category]}</span>
            <b>{i.title}</b>{i.body && <p className="small">{i.body}</p>}
            <div className="row"><LinkButton fromType="idea" fromId={i.id} excludeProject={p.id} /></div>
          </div>
        ))}
        {notes.data?.map((n) => (
          <div key={n.id} className="glass note-card">
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="chip">{n.kind === 'note' ? 'Note' : 'Reference'}</span><span className="small muted">{formatShort(dayKeyOf(n.created_at))}</span></div>
            <b>{n.title}</b>{n.body && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>}
            {n.url && <a className="small" href={n.url} target="_blank" rel="noopener noreferrer">{n.url.replace(/^https?:\/\//, '').slice(0, 50)}</a>}
            <select id={`nt-${n.id}`} className="select" style={{ padding: '5px 8px', fontSize: 12 }} value={n.task_id ?? ''} onChange={(e) => mut.mutate({ op: 'update', id: n.id, row: { task_id: e.target.value || null } })} aria-label="Link to task">
              <option value="">Link to task…</option>{projTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <div className="row"><LinkButton fromType="note" fromId={n.id} excludeProject={p.id} /><ConfirmButton label="Delete" className="btn btn-ghost btn-sm" confirmText="Delete?" onConfirm={() => mut.mutate({ op: 'delete', id: n.id })} /></div>
          </div>
        ))}
      </div>
      {!notes.data?.length && !projIdeas.length && <Empty title="No notes yet">Quickly write in the box above.</Empty>}
    </div>
  );
}

// ── Projeye connected fırsatlar ────────────────────────────
function ProjectOppsTab({ p }: { p: Project }) {
  const opps = useOpportunities();
  const links = useProjectOpps();
  const dates = useOppDates();
  const mut = useRowMutation('project_opportunities', ['opps']);
  const toast = useToast();
  const mine = (links.data ?? []).filter((l) => l.project_id === p.id);
  return (
    <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Exhibitions & applications</h2>
        <div className="row">
          <select id="po-link" className="select" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && mut.mutate({ op: 'insert', row: { project_id: p.id, opportunity_id: e.target.value } }, { onError: (x) => toast.fail(x) })}>
            <option value="">Link opportunity…</option>{opps.data?.filter((o) => !mine.some((l) => l.opportunity_id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <Link className="btn btn-primary btn-sm" to="/opportunities">Opportunities hub</Link>
        </div>
      </div>
      {mine.length === 0 && <p className="small muted">No exhibitions or applications linked to this project.</p>}
      {mine.map((l) => {
        const o = opps.data?.find((x) => x.id === l.opportunity_id); if (!o) return null;
        const dl = dates.data?.find((d) => d.opportunity_id === o.id && d.kind === 'deadline');
        return (
          <Link key={l.id} to={`/opportunities/${o.id}`} className="task-row" style={{ textDecoration: 'none', color: 'inherit' }}>
            <i className="dot" style={{ width: 10, height: 10, marginTop: 6, background: OPP_STATUS_COLOR[o.status] }} />
            <div className="t"><b>{o.title}</b><div className="meta"><span>{OPP_STATUS_LABEL[o.status]}</span>{o.organization && <span>{o.organization}</span>}{dl && <span style={{ color: dl.day < todayKey() ? 'var(--ink-500)' : 'var(--orange-600)' }}>Application deadline: {formatLong(dl.day)}</span>}</div></div>
          </Link>
        );
      })}
    </section>
  );
}


function CollectionLink({ slug }: { slug: string }) {
  const n = (useNfts().data?.items ?? []).filter((i) => i.c === slug).length;
  return <Link className="btn btn-primary btn-sm" to={`/collections/${slug}`}><Compass size={13} />Open collection{n ? ` · ${n} artworks` : ''}</Link>;
}
