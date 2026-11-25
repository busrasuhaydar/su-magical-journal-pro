// Project listesi; kart tıklanınca proje çalışma alanı açılır.
import { DragList, DragRow, SortPicker, sortList, useListPrefs, useReorder } from '../lib/listSort';
import { PRIORITY_ORDER } from '../lib/types';
import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Thumb } from './project/Gallery';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Dialog, Empty, Field, useToast } from '../components/ui';
import { useProgress, useProjects, useSaveProject, useSoftDelete, useFiles } from '../lib/data';
import { formatRelative } from '../lib/dates';
import { slugify } from '../lib/supabase';
import { isCollectionProject, useEnsureCollectionProjects, useNfts } from '../lib/nft';
import { PRIORITY_LABEL, PROJECT_ICONS, PROJECT_STATUS_LABEL, type Priority, type Project, type ProjectStatus } from '../lib/types';

const COLORS = ['#E2558C', '#1FA9A6', '#F28A5C', '#9B6FE0', '#5AA9E6', '#D4A017', '#3A2131'];

export default function ProjectsPage() {
  const projects = useProjects();
  const progress = useProgress();
  const [edit, setEdit] = useState<Partial<Project> | null>(null);
  const nav = useNavigate();
  const files = useFiles();
  const coverOf = (p: Project) => files.data?.find((f) => f.id === p.cover_file_id);
  useEnsureCollectionProjects();
  const nfts = useNfts().data;
  const lp = useListPrefs('projects', 'manual');
  const reorder = useReorder('projects', [['projects']]);
  const plist = sortList(projects.data ?? [], lp.mode, { date: (p) => p.target_date ?? p.created_at, priority: (p) => PRIORITY_ORDER[p.priority], name: (p) => p.title });
  const mosaic = (p: Project) => { const slug = p.slug.replace('koleksiyon-', ''); const l = (nfts?.items ?? []).filter((n) => n.c === slug); return [0, 1, 2, 3].map((k) => l[Math.floor((l.length / 4) * k)]?.thumb).filter(Boolean) as string[]; };

  return (
    <>
      <PageHead title="My Projects">
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}><Plus size={15} />New project</button>
      </PageHead>

      {projects.data?.length === 0 && <section className="glass panel"><Empty title="Your first project">e.g. SU'RÉAL CITY, SAVE ME, Ghost Sculpture…</Empty></section>}
      <div className="row list-tools"><SortPicker id="psort" mode={lp.mode} onChange={lp.setMode} /></div>
      <DragList ids={plist.map((p) => p.id)} enabled={lp.mode === 'manual'} onMove={(a, b) => reorder(plist.map((p) => p.id), a, b)}>
      <div className="cards">
        {plist.map((p) => {
          const pr = progress.data?.get(p.id);
          return (
            <DragRow key={p.id} id={p.id} enabled={lp.mode === 'manual'} className="card-drag">
            <div className="glass proj-card pcard" onClick={() => nav(`/projects/${p.slug}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/projects/${p.slug}`)}>
              <div className="pcard-cover" style={{ background: `linear-gradient(120deg, ${p.color}55, #FFE3D3 60%, #DDF5F8)` }}>{isCollectionProject(p) ? <div className="pcard-mosaic">{mosaic(p).map((u) => <img key={u} src={u} alt="" loading="lazy" />)}</div> : coverOf(p) && <Thumb file={coverOf(p)!} />}<span className="pcard-icon" style={{ borderColor: `${p.color}66` }}>{p.icon ?? '✦'}</span></div>
              <div style={{ padding: '14px 18px 18px', display: 'grid', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 8 }}><h3>{p.title}</h3></span>
                <span className="mono" style={{ color: 'var(--rose-600)', fontSize: 18 }}>%{pr?.progress ?? 0}</span>
              </div>
              <div className="prog"><b style={{ width: `${pr?.progress ?? 0}%`, background: `linear-gradient(90deg, ${p.color}88, ${p.color})` }} /></div>
              <div className="row small muted" style={{ gap: 10 }}>
                <span className="chip">{PROJECT_STATUS_LABEL[p.status]}</span>{isCollectionProject(p) && <Link className="chip chip-on-soft" to={`/collections/${p.slug.replace('koleksiyon-', '')}`} onClick={(e) => e.stopPropagation()}>🖼️ Open collection</Link>}<span>{PRIORITY_LABEL[p.priority]} öncelik</span>
                <span>{pr?.done_tasks ?? 0}/{pr?.total_tasks ?? 0} tasks{pr?.is_manual ? ' · manually entered progress' : ''}</span>
                {p.target_date && <span>Goal: {formatRelative(p.target_date)}</span>}
              </div>
              {p.description && <p className="small muted" style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
              {(pr?.overdue_tasks ?? 0) > 0 && <span className="small" style={{ color: 'var(--bad)' }}>⚠ {pr!.overdue_tasks} overdue tasks</span>}
              </div>
            </div>
            </DragRow>
          );
        })}
      </div>
      </DragList>
      {edit && <ProjectEditor draft={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function ProjectEditor({ draft, onClose }: { draft: Partial<Project>; onClose: () => void }) {
  const save = useSaveProject();
  const del = useSoftDelete('projects');
  const toast = useToast();
  const [f, setF] = useState({
    title: draft.title ?? '', status: (draft.status ?? 'active') as ProjectStatus, priority: (draft.priority ?? 'medium') as Priority,
    start_date: draft.start_date ?? '', target_date: draft.target_date ?? '', color: draft.color ?? COLORS[0], description: draft.description ?? '',
    progress_override: draft.progress_override != null ? String(draft.progress_override) : '', icon: draft.icon ?? '✦',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!f.title.trim()) return setErr('Project name can’t be empty.');
    if (f.start_date && f.target_date && f.target_date < f.start_date) return setErr('Target date can’t be before the start date.');
    const po = f.progress_override === '' ? null : Number(f.progress_override);
    if (po != null && (isNaN(po) || po < 0 || po > 100)) return setErr('Progress must be between 0 and 100.');
    try {
      await save.mutateAsync({ id: draft.id, title: f.title.trim(), slug: draft.slug ?? `${slugify(f.title)}-${Date.now().toString(36).slice(-4)}`,
        status: f.status, priority: f.priority, start_date: f.start_date || null, target_date: f.target_date || null, color: f.color,
        description: f.description.trim() || null, progress_override: po, icon: f.icon });
      toast.ok(draft.id ? 'Project updated' : 'Project created'); onClose();
    } catch (x) { toast.fail(x); }
  }
  return (
    <Dialog title={draft.id ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <Field label="Project name"><input id="p-title" className="input" value={f.title} onChange={set('title')} placeholder="e.g. SU'RÉAL CITY" /></Field>
        <div className="grid-2">
          <Field label="Status"><select id="p-st" className="select" value={f.status} onChange={set('status')}>{Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Priority"><select id="p-pri" className="select" value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Start"><input id="p-sd" type="date" className="input" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field label="Target date"><input id="p-td" type="date" className="input" value={f.target_date} onChange={set('target_date')} /></Field>
        </div>
        <Field label="Icon">
          <div className="row" style={{ gap: 4 }}>{PROJECT_ICONS.map((i) => <button type="button" key={i} onClick={() => setF((s) => ({ ...s, icon: i }))} style={{ width: 32, height: 32, borderRadius: 8, border: f.icon === i ? '2px solid var(--rose-500)' : '1px solid var(--line)', background: '#fff', cursor: 'pointer', fontSize: 16 }}>{i}</button>)}</div>
        </Field>
        <Field label="Color">
          <div className="row">{COLORS.map((c) => <button type="button" key={c} aria-label={c} onClick={() => setF((s) => ({ ...s, color: c }))} style={{ width: 28, height: 28, borderRadius: 8, background: c, border: f.color === c ? '3px solid #fff' : '1px solid #fff', boxShadow: f.color === c ? `0 0 0 2px ${c}` : 'none', cursor: 'pointer' }} />)}</div>
        </Field>
        <Field label="Description"><textarea id="p-desc" className="textarea" value={f.description} onChange={set('description')} /></Field>
        <Field label="Progress (calculated from tasks if left empty)"><input id="p-po" className="input" inputMode="numeric" value={f.progress_override} onChange={set('progress_override')} placeholder="e.g. 78" /></Field>
        {err && <div className="error">{err}</div>}
        <div className="foot">
          <div>{draft.id && <ConfirmButton label="Delete" confirmText="Move this project to trash? Tasks aren’t deleted." onConfirm={async () => { try { await del.mutateAsync(draft.id!); toast.ok('Project deleted'); onClose(); } catch (x) { toast.fail(x); } }} />}</div>
          <div className="row"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
        </div>
      </form>
    </Dialog>
  );
}
