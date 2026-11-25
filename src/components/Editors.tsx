// Task ve etkinlik düzenleyicileri. Her sayfa aynı formu kullanır, aynı kaydı düzenler.
import { RuleBuilder } from './RuleBuilder';
import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react';
import { useProjects, useSaveEvent, useSaveTask, useSoftDelete, useCompleteTask, useTasks } from '../lib/data';
import { dayKeyOf, hhmm, minutesOf, parseHHMM, toInstant, todayKey, type DayKey } from '../lib/dates';
import { REMINDER_OPTIONS, EVENT_KIND_LABEL, PRIORITY_LABEL, RRULE_LABEL, STATUS_LABEL, TASK_CATEGORIES, type CalEvent, type EventKind, type Priority, type Task, type TaskStatus } from '../lib/types';
import { ConfirmButton, Dialog, Field, useToast } from './ui';
import { TagPicker } from './TagPicker';
import { getPref } from '../lib/prefs';
import { PostEditor } from './PostEditor';
import type { SocialPost } from '../lib/types';

type TaskDraft = Partial<Task>;
type EventDraft = Partial<CalEvent>;
const Ctx = createContext<{ openTask: (t?: TaskDraft) => void; openEvent: (e?: EventDraft) => void; openPost: (p?: Partial<SocialPost>) => void }>({ openTask: () => {}, openEvent: () => {}, openPost: () => {} });
export const useEditors = () => useContext(Ctx);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<TaskDraft | null>(null);
  const [event, setEvent] = useState<EventDraft | null>(null);
  const [post, setPost] = useState<Partial<SocialPost> | null>(null);
  return (
    <Ctx.Provider value={{ openTask: (t) => setTask(t ?? {}), openEvent: (e) => setEvent(e ?? {}), openPost: (p) => setPost(p ?? {}) }}>
      {children}
      {task && <TaskEditor draft={task} onClose={() => setTask(null)} />}
      {event && <EventEditor draft={event} onClose={() => setEvent(null)} />}
      {post && <PostEditor draft={post} onClose={() => setPost(null)} />}
    </Ctx.Provider>
  );
}

const REMINDERS = REMINDER_OPTIONS;

function TaskEditor({ draft, onClose }: { draft: TaskDraft; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveTask();
  const del = useSoftDelete('tasks');
  const complete = useCompleteTask();
  const projects = useProjects();
  const startDay = draft.starts_at ? dayKeyOf(draft.starts_at) : draft.due_date ?? '';
  const [f, setF] = useState({
    title: draft.title ?? '', description: draft.description ?? '', day: startDay,
    start: draft.starts_at ? hhmm(minutesOf(draft.starts_at)) : '', end: draft.ends_at ? hhmm(minutesOf(draft.ends_at)) : '',
    priority: (draft.priority ?? 'medium') as Priority, category: draft.category ?? '', project_id: draft.project_id ?? '',
    rrule: draft.rrule ?? '', status: (draft.status ?? 'todo') as TaskStatus, reminder: draft.id ? '' : getPref('defaultReminder', ''), parent_task_id: draft.parent_task_id ?? '',
  });
  const allTasks = useTasks();
  const subtasks = draft.id ? (allTasks.data ?? []).filter((t) => t.parent_task_id === draft.id && t.status !== 'cancelled') : [];
  const [subTitle, setSubTitle] = useState('');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!f.title.trim()) return setErr('Title can’t be empty.');
    let starts_at: string | null = null, ends_at: string | null = null;
    if (f.start) {
      if (!f.day) return setErr('If you set a time, set a date too.');
      const s = parseHHMM(f.start); const en = f.end ? parseHHMM(f.end) : s! + 60;
      if (s == null || en == null) return setErr('Time must be in HH:MM format (e.g. 14:30).');
      if (en <= s) return setErr('End time must be after the start time.');
      starts_at = toInstant(f.day, s); ends_at = toInstant(f.day, en);
    }
    try {
      await save.mutateAsync({
        id: draft.id, title: f.title.trim(), description: f.description.trim() || null, due_date: f.day || null,
        starts_at, ends_at, priority: f.priority, category: f.category || null, project_id: f.project_id || null,
        rrule: f.rrule || null, status: f.status, parent_task_id: f.parent_task_id || null, opportunity_id: draft.opportunity_id ?? null, completed_at: f.status === 'done' ? draft.completed_at ?? new Date().toISOString() : null,
        reminderMinutes: f.reminder === '' ? (draft.id ? null : undefined) : Number(f.reminder),
      });
      toast.ok(draft.id ? 'Task updated' : 'Task added'); onClose();
    } catch (x) { toast.fail(x); }
  }

  return (
    <Dialog title={draft.id ? 'Edit task' : 'New task'} onClose={onClose}>
      <form onSubmit={submit} className="task-form" style={{ display: 'grid', gap: 12 }}>
        <Field label="Title"><input id="t-title" className="input" value={f.title} onChange={set('title')} placeholder="e.g. Prepare artwork for SU'RÉAL CITY" /></Field>
        <Field label="Description"><textarea id="t-desc" className="textarea" value={f.description} onChange={set('description')} /></Field>
        {draft.id && <div className="field"><span>Tags</span><TagPicker type="task" id={draft.id} /></div>}
        <div className="grid-3">
          <Field label="Date"><input id="t-day" type="date" className="input" value={f.day} onChange={set('day')} /></Field>
          <Field label="Start"><input id="t-start" type="time" step={900} className="input" value={f.start} onChange={set('start')} /></Field>
          <Field label="End"><input id="t-end" type="time" step={900} className="input" value={f.end} onChange={set('end')} /></Field>
        </div>
        <div className="grid-3">
          <Field label="Priority"><select id="t-pri" className="select" value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Category"><select id="t-cat" className="select" value={f.category} onChange={set('category')}><option value="">Not selected</option>{TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Project"><select id="t-proj" className="select" value={f.project_id} onChange={set('project_id')}><option value="">No project</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
        </div>
        <div className="grid-3">
          <Field label="Repeat"><select id="t-rr" className="select" value={f.rrule in RRULE_LABEL ? f.rrule : 'custom'} onChange={(e) => setF((s) => ({ ...s, rrule: e.target.value === 'custom' ? 'FREQ=WEEKLY;BYDAY=MO' : e.target.value }))}>{Object.entries(RRULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="custom">Custom…</option></select></Field>
          <Field label="Reminder"><select id="t-rem" className="select" value={f.reminder} onChange={set('reminder')}>{REMINDERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Status"><select id="t-st" className="select" value={f.status} onChange={set('status')}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        {f.rrule && !(f.rrule in RRULE_LABEL) && <RuleBuilder value={f.rrule} start={f.day} onChange={(rrule) => setF((s) => ({ ...s, rrule }))} />}
        {f.project_id && <Field label="Parent task (if this is a subtask)"><select id="t-parent" className="select" value={f.parent_task_id} onChange={set('parent_task_id')}><option value="">No parent task</option>{(allTasks.data ?? []).filter((t) => t.project_id === f.project_id && t.id !== draft.id && !t.parent_task_id && t.status !== 'cancelled').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>}
        {draft.id && !f.parent_task_id && (
          <div className="card" style={{ display: 'grid', gap: 6 }}>
            <b className="small">Subtasks {subtasks.length > 0 && `· ${subtasks.filter((s) => s.status === 'done').length}/${subtasks.length}`}</b>
            {subtasks.map((s) => (
              <label key={s.id} className="row small" style={{ gap: 8, cursor: 'pointer' }}>
                <input id={`sub-${s.id}`} type="checkbox" checked={s.status === 'done'} onChange={(e) => complete.mutate({ id: s.id, done: e.target.checked })} />
                <span style={{ textDecoration: s.status === 'done' ? 'line-through' : undefined }}>{s.title}</span>
              </label>
            ))}
            <div className="row">
              <input id="t-subnew" className="input" style={{ flex: 1, width: 'auto', padding: '6px 10px' }} value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add subtask"
                onKeyDown={async (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!subTitle.trim()) return; try { await save.mutateAsync({ title: subTitle.trim(), parent_task_id: draft.id, project_id: f.project_id || null, priority: f.priority }); setSubTitle(''); } catch (x) { toast.fail(x); } } }} />
            </div>
          </div>
        )}
        {err && <div className="error">{err}</div>}
        <div className="foot">
          <div className="row">
            {draft.id && <ConfirmButton label="Delete" confirmText="Move this task to trash?" onConfirm={async () => { try { await del.mutateAsync(draft.id!); toast.ok('Task deleted'); onClose(); } catch (x) { toast.fail(x); } }} />}
            {draft.id && draft.status !== 'done' && <button type="button" className="btn btn-teal" onClick={async () => { try { await complete.mutateAsync({ id: draft.id!, done: true }); toast.ok('Completed'); onClose(); } catch (x) { toast.fail(x); } }}>Complete</button>}
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function EventEditor({ draft, onClose }: { draft: EventDraft; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveEvent();
  const del = useSoftDelete('events');
  const projects = useProjects();
  const d0: DayKey = draft.starts_at ? dayKeyOf(draft.starts_at) : todayKey();
  const [f, setF] = useState({
    title: draft.title ?? '', kind: (draft.kind ?? 'meeting') as EventKind, day: d0,
    endDay: draft.ends_at ? dayKeyOf(draft.ends_at) : d0,
    start: draft.starts_at ? hhmm(minutesOf(draft.starts_at)) : '10:00', end: draft.ends_at ? hhmm(minutesOf(draft.ends_at)) : '11:00',
    all_day: draft.all_day ?? false, location: draft.location ?? '', project_id: draft.project_id ?? '', description: draft.description ?? '',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!f.title.trim()) return setErr('Title can’t be empty.');
    const s = f.all_day ? 0 : parseHHMM(f.start), en = f.all_day ? 23 * 60 + 59 : parseHHMM(f.end);
    if (s == null || en == null) return setErr('Time must be in HH:MM format.');
    const starts_at = toInstant(f.day, s), ends_at = toInstant(f.endDay || f.day, en);
    if (ends_at < starts_at) return setErr('End can’t be before the start.');
    try {
      await save.mutateAsync({ id: draft.id, title: f.title.trim(), kind: f.kind, starts_at, ends_at, all_day: f.all_day,
        location: f.location.trim() || null, project_id: f.project_id || null, description: f.description.trim() || null });
      toast.ok(draft.id ? 'Event updated' : 'Event added'); onClose();
    } catch (x) { toast.fail(x); }
  }

  return (
    <Dialog title={draft.id ? 'Edit event' : 'New event'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <Field label="Title"><input id="e-title" className="input" value={f.title} onChange={set('title')} placeholder="e.g. Meeting with the agency" /></Field>
        <div className="grid-2">
          <Field label="Type"><select id="e-kind" className="select" value={f.kind} onChange={set('kind')}>{Object.entries(EVENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Project"><select id="e-proj" className="select" value={f.project_id} onChange={set('project_id')}><option value="">No project</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
        </div>
        <div className="grid-2">
          <Field label="Start date"><input id="e-day" type="date" className="input" value={f.day} onChange={(e) => setF((s) => ({ ...s, day: e.target.value, endDay: s.endDay < e.target.value ? e.target.value : s.endDay }))} /></Field>
          <Field label="End date"><input id="e-endday" type="date" className="input" value={f.endDay} min={f.day} onChange={set('endDay')} /></Field>
        </div>
        <label className="row small" style={{ cursor: 'pointer' }}><input id="e-allday" type="checkbox" checked={f.all_day} onChange={(e) => setF((s) => ({ ...s, all_day: e.target.checked }))} /> All day</label>
        {!f.all_day && <div className="grid-2">
          <Field label="Start time"><input id="e-start" type="time" step={900} className="input" value={f.start} onChange={set('start')} /></Field>
          <Field label="End time"><input id="e-end" type="time" step={900} className="input" value={f.end} onChange={set('end')} /></Field>
        </div>}
        <Field label="Location"><input id="e-loc" className="input" value={f.location} onChange={set('location')} placeholder="e.g. Karaköy, Istanbul" /></Field>
        <Field label="Notes"><textarea id="e-desc" className="textarea" value={f.description} onChange={set('description')} /></Field>
        {err && <div className="error">{err}</div>}
        <div className="foot">
          <div>{draft.id && <ConfirmButton label="Delete" confirmText="Move this event to trash?" onConfirm={async () => { try { await del.mutateAsync(draft.id!); toast.ok('Event deleted'); onClose(); } catch (x) { toast.fail(x); } }} />}</div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
