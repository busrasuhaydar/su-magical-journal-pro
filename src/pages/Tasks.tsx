import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { useEditors } from '../components/Editors';
import { TaskRow } from '../components/TaskRow';
import { Empty } from '../components/ui';
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
        <div className="task-list">{list.map((t) => <TaskRow key={t.id} task={t} overdue={overdue} />)}</div>
      </section>
    ) : null;

  const nothing = !tasks.isLoading && !groups.overdue.length && !groups.today.length && !groups.week.length && !groups.later.length && !groups.undated.length;
  return (
    <>
      <PageHead title="Tasks">
        <button type="button" className="btn btn-primary" onClick={() => openTask({ due_date: today })}><Plus size={15} />New task</button>
      </PageHead>
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
