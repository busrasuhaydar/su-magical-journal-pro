import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, FolderInput, ListChecks, Plus, Trash2 } from 'lucide-react';
import { BulkBar } from '../components/BulkActions';
import { supabase } from '../lib/supabase';
import { STATUS_LABEL, type TaskStatus } from '../lib/types';
import { PageHead } from '../components/Shell';
import { useEditors } from '../components/Editors';
import { TaskRow } from '../components/TaskRow';
import { ConfirmButton, Empty, useToast } from '../components/ui';
import { useProjects, useTasks } from '../lib/data';
import { addDays, dayKeyOf, todayKey } from '../lib/dates';
import { PRIORITY_LABEL, PRIORITY_ORDER, type Task } from '../lib/types';

export default function TasksPage() {
  const tasks = useTasks();
  const projects = useProjects();
  const { openTask } = useEditors();
  const [q, setQ] = useState('');
  const [pri, setPri] = useState('');
  const [proj, setProj] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function bulk(patch: Record<string, unknown>, msg: string) {
    const ids = [...sel]; if (!ids.length) return;
    const { error } = await supabase.from('tasks').update(patch).in('id', ids);
    if (error) return toast.fail(error);
    ['tasks', 'cal', 'year', 'progress'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    toast.ok(`${ids.length} tasks ${msg}`); setSel(new Set());
  }
  const today = todayKey(), weekEnd = addDays(today, 7);
  const nowIso = new Date().toISOString();

  const groups = useMemo(() => {
    const list = (tasks.data ?? []).filter((t) =>
      (!q || t.title.toLocaleLowerCase('en').includes(q.toLocaleLowerCase('en'))) && (!pri || t.priority === pri) && (!proj || t.project_id === proj));
    const dayOf = (t: Task) => (t.starts_at ? dayKeyOf(t.starts_at) : t.due_date);
    const open = list.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    const sort = (a: Task, b: Task) => (dayOf(a) ?? '9').localeCompare(dayOf(b) ?? '9') || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    const isOverdue = (t: Task) => (t.ends_at ? t.ends_at < nowIso : !!t.due_date && t.due_date < today);
    return {
      overdue: open.filter(isOverdue).sort(sort),
      today: open.filter((t) => !isOverdue(t) && dayOf(t) === today).sort(sort),
      week: open.filter((t) => !isOverdue(t) && dayOf(t) && dayOf(t)! > today && dayOf(t)! <= weekEnd).sort(sort),
      later: open.filter((t) => dayOf(t) && dayOf(t)! > weekEnd).sort(sort),
      undated: open.filter((t) => !dayOf(t)).sort(sort),
      done: list.filter((t) => t.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
      cancelled: list.filter((t) => t.status === 'cancelled').slice(0, 30),
    };
  }, [tasks.data, q, pri, proj, today, weekEnd, nowIso]);

  const Section = ({ title, list, overdue, color }: { title: string; list: Task[]; overdue?: boolean; color?: string }) =>
    list.length ? (
      <section className="glass panel">
        <div className="panel-head"><h2 style={{ color }}>{title}</h2><span className="count">{list.length}</span></div>
        <div className="task-list">{list.map((t) => selecting
          ? <div key={t.id} className={`sel-row${sel.has(t.id) ? ' on' : ''}`}><input id={`sel-${t.id}`} type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.title}`} /><TaskRow task={t} overdue={overdue} /></div>
          : <TaskRow key={t.id} task={t} overdue={overdue} />)}</div>
      </section>
    ) : null;

  const visible = [...groups.overdue, ...groups.today, ...groups.week, ...groups.later, ...groups.undated, ...(showDone ? [...groups.done, ...groups.cancelled] : [])];
  const nothing = !tasks.isLoading && !groups.overdue.length && !groups.today.length && !groups.week.length && !groups.later.length && !groups.undated.length;
  return (
    <>
      <PageHead title="Tasks">
        <button type="button" className={`btn ${selecting ? 'btn-primary' : 'btn-glass'}`} aria-pressed={selecting} onClick={() => { setSelecting((x) => !x); setSel(new Set()); }}><ListChecks size={15} />Select</button>
        <button type="button" className="btn btn-primary" onClick={() => openTask({ due_date: today })}><Plus size={15} />New task</button>
      </PageHead>
      {selecting && (
        <BulkBar count={sel.size} total={visible.length} onAll={() => setSel(new Set(visible.map((t) => t.id)))} onClear={() => setSel(new Set())}>
          <label className="bulk-field"><CheckSquare size={13} /><select id="bulk-status" className="select" value="" disabled={!sel.size} onChange={(e) => { const v = e.target.value as TaskStatus; if (v) void bulk({ status: v, completed_at: v === 'done' ? new Date().toISOString() : null }, `set to “${STATUS_LABEL[v]}”`); }} aria-label="Change status"><option value="">Status…</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="bulk-field"><FolderInput size={13} /><select id="bulk-proj" className="select" value="" disabled={!sel.size} onChange={(e) => { const v = e.target.value; if (v) void bulk({ project_id: v === '-' ? null : v }, 'moved'); }} aria-label="Move to project"><option value="">Move to…</option><option value="-">No project</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
          <ConfirmButton className="btn btn-ghost btn-sm" label={<><Trash2 size={13} />Delete</>} confirmText={`Move ${sel.size} tasks to trash?`} onConfirm={() => bulk({ deleted_at: new Date().toISOString() }, 'moved to trash')} />
        </BulkBar>
      )}
      <div className="glass panel" style={{ padding: 14 }}>
        <div className="row">
          <input id="tq" className="input" style={{ flex: '1 1 200px', width: 'auto' }} placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select id="tpri" className="select" style={{ width: 'auto' }} value={pri} onChange={(e) => setPri(e.target.value)}><option value="">All priorities</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select id="tproj" className="select" style={{ width: 'auto' }} value={proj} onChange={(e) => setProj(e.target.value)}><option value="">All projects</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          <label className="row small" style={{ gap: 6, cursor: 'pointer' }}><input id="tdone" type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show completed</label>
        </div>
      </div>
      {tasks.isLoading && <p className="muted">Loading…</p>}
      {nothing && <section className="glass panel"><Empty title="The list is empty">Start by adding a new task.</Empty></section>}
      <Section title="Overdue" list={groups.overdue} overdue color="var(--orange-600)" />
      <Section title="Today" list={groups.today} />
      <Section title="This Week" list={groups.week} />
      <Section title="Later" list={groups.later} />
      <Section title="No date" list={groups.undated} />
      {showDone && <Section title="Completed" list={groups.done} />}
      {showDone && <Section title="Cancelled" list={groups.cancelled} />}
    </>
  );
}
