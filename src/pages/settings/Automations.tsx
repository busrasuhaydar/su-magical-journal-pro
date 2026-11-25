// Ayarlar · Otomasyonlar: basit "Eğer … ise …" kural oluşturucu. Tetikleyiciler DB'de, tarih tetikleyicileri saatlik zamanlayıcıda çalışır.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Workflow, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Field, useToast } from '../../components/ui';
import { OPP_STATUS_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL } from '../../lib/types';
import { useTags } from '../../lib/tags';

interface Trigger { type: 'status_changed' | 'record_created' | 'date_reached'; table: 'tasks' | 'opportunities' | 'projects'; to?: string; days_before?: number }
interface Action { type: 'create_task' | 'set_status' | 'add_tag' | 'notify'; title?: string; status?: string; tag_id?: string; message?: string; due_in_days?: number }
interface Automation { id: string; name: string; enabled: boolean; trigger: Trigger; action: Action; run_count: number; last_run_at: string | null }

const TABLE_LABEL = { tasks: 'a task', opportunities: 'an opportunity', projects: 'a project' };
const statuses = (t: Trigger['table']): Record<string, string> => (t === 'tasks' ? STATUS_LABEL : t === 'opportunities' ? OPP_STATUS_LABEL : PROJECT_STATUS_LABEL);

function useAutomations() {
  return useQuery({ queryKey: ['automations'], queryFn: async () => {
    const { data, error } = await supabase.from('automations').select('*').is('deleted_at', null).order('created_at');
    if (error) throw error; return data as Automation[];
  } });
}
export function describe(a: Pick<Automation, 'trigger' | 'action'>, tagName?: (id: string) => string | undefined) {
  const t = a.trigger, x = a.action, st = statuses(t.table);
  const when = t.type === 'record_created' ? `${TABLE_LABEL[t.table]} is created`
    : t.type === 'status_changed' ? `${TABLE_LABEL[t.table]} changes to “${t.to ? st[t.to] ?? t.to : 'any status'}”`
      : t.table === 'tasks' ? `a task is due in ${t.days_before ?? 0} days` : t.table === 'opportunities' ? `an application deadline is ${t.days_before ?? 0} days away` : `a project goal is ${t.days_before ?? 0} days away`;
  const then = x.type === 'create_task' ? `create task “${x.title || 'Follow up'}”${x.due_in_days ? ` due in ${x.due_in_days} days` : ''}`
    : x.type === 'set_status' ? `set status to “${x.status ? st[x.status] ?? x.status : '?'}”`
      : x.type === 'add_tag' ? `add tag #${(x.tag_id && tagName?.(x.tag_id)) ?? '?'}` : `notify me${x.message ? `: “${x.message}”` : ''}`;
  return `If ${when}, then ${then}.`;
}

export function AutomationSettings() {
  const list = useAutomations();
  const tags = useTags();
  const qc = useQueryClient();
  const toast = useToast();
  const [t, setT] = useState<Trigger>({ type: 'status_changed', table: 'opportunities', to: 'accepted' });
  const [x, setX] = useState<Action>({ type: 'create_task', title: 'Prepare artwork delivery for {title}', due_in_days: 7 });
  const tagName = (id: string) => tags.data?.find((g) => g.id === id)?.name;
  const refresh = () => qc.invalidateQueries({ queryKey: ['automations'] });
  async function add() {
    const { error } = await supabase.from('automations').insert({ name: describe({ trigger: t, action: x }, tagName).slice(0, 120), trigger: t, action: x });
    if (error) return toast.fail(error);
    refresh(); toast.ok('Rule added ✦');
  }
  async function patch(id: string, p: Partial<Automation> & { deleted_at?: string }) { const { error } = await supabase.from('automations').update(p).eq('id', id); if (error) toast.fail(error); refresh(); }
  const st = statuses(t.table);
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Automations</h2><Workflow size={18} className="muted" /></div>
      <div className="auto-list">
        {(list.data ?? []).map((a) => (
          <div key={a.id} className={`auto-row${a.enabled ? '' : ' off'}`}>
            <label className="row small" style={{ gap: 8, flex: 1, cursor: 'pointer' }}>
              <input type="checkbox" checked={a.enabled} onChange={(e) => patch(a.id, { enabled: e.target.checked })} aria-label="Enabled" />
              <span>{describe(a, tagName)}<span className="muted"> · ran {a.run_count}×</span></span>
            </label>
            <button type="button" className="btn btn-ghost btn-sm icon-only" aria-label="Delete rule" onClick={() => patch(a.id, { deleted_at: new Date().toISOString() })}><Trash2 size={13} /></button>
          </div>
        ))}
        {!list.isLoading && !list.data?.length && <p className="small muted">No rules yet. Build one below.</p>}
      </div>
      <div className="auto-build">
        <b className="small">If…</b>
        <div className="grid-3">
          <Field label="When"><select className="select" value={t.type} onChange={(e) => setT({ ...t, type: e.target.value as Trigger['type'] })}><option value="status_changed">Status changes</option><option value="record_created">Record is created</option><option value="date_reached">Date is reached</option></select></Field>
          <Field label="Record"><select className="select" value={t.table} onChange={(e) => setT({ ...t, table: e.target.value as Trigger['table'], to: '' })}><option value="tasks">Task</option><option value="opportunities">Opportunity</option><option value="projects">Project</option></select></Field>
          {t.type === 'status_changed' && <Field label="To status"><select className="select" value={t.to ?? ''} onChange={(e) => setT({ ...t, to: e.target.value })}><option value="">Any</option>{Object.entries(st).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
          {t.type === 'date_reached' && <Field label="Days before"><input className="input" type="number" min={0} max={60} value={t.days_before ?? 0} onChange={(e) => setT({ ...t, days_before: Number(e.target.value) })} /></Field>}
        </div>
        <b className="small">…then</b>
        <div className="grid-3">
          <Field label="Do"><select className="select" value={x.type} onChange={(e) => setX({ type: e.target.value as Action['type'] })}><option value="create_task">Create a task</option><option value="set_status">Change status</option><option value="add_tag">Add a tag</option><option value="notify">Send a notification</option></select></Field>
          {x.type === 'create_task' && <>
            <Field label="Task title ({title} = record)"><input className="input" value={x.title ?? ''} onChange={(e) => setX({ ...x, title: e.target.value })} /></Field>
            <Field label="Due in days"><input className="input" type="number" min={0} max={365} value={x.due_in_days ?? 0} onChange={(e) => setX({ ...x, due_in_days: Number(e.target.value) })} /></Field>
          </>}
          {x.type === 'set_status' && <Field label="Status"><select className="select" value={x.status ?? ''} onChange={(e) => setX({ ...x, status: e.target.value })}><option value="">—</option>{Object.entries(st).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
          {x.type === 'add_tag' && <Field label="Tag"><select className="select" value={x.tag_id ?? ''} onChange={(e) => setX({ ...x, tag_id: e.target.value })}><option value="">—</option>{(tags.data ?? []).map((g) => <option key={g.id} value={g.id}>#{g.name}</option>)}</select></Field>}
          {x.type === 'notify' && <Field label="Message ({title} = record)"><input className="input" value={x.message ?? ''} onChange={(e) => setX({ ...x, message: e.target.value })} /></Field>}
        </div>
        <p className="small muted" style={{ margin: 0 }}><Zap size={12} /> {describe({ trigger: t, action: x }, tagName)}</p>
        <button type="button" className="btn btn-primary btn-sm" style={{ justifySelf: 'start' }} onClick={add} disabled={(x.type === 'set_status' && !x.status) || (x.type === 'add_tag' && !x.tag_id)}><Plus size={14} />Add rule</button>
      </div>
    </section>
  );
}
