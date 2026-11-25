import { DragList, DragRow, SortPicker, sortList, useListPrefs, useReorder } from '../lib/listSort';
import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Mail, Globe, Phone, CalendarClock, Pencil } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Dialog, Empty, Field, useToast } from '../components/ui';
import { TagPicker } from '../components/TagPicker';
import { useContacts, useInteractions, useProjectContacts, useProjects, useRowMutation, useSaveContact, useSaveInteraction, useSaveTask, useSoftDelete } from '../lib/data';
import { dayKeyOf, formatRelative, formatShort, hhmm, minutesOf, parseHHMM, toInstant, todayKey, addDays } from '../lib/dates';
import { CONTACT_CATEGORY_LABEL, INTERACTION_LABEL, type Contact, type ContactCategory, type InteractionKind } from '../lib/types';

export default function ContactsPage() {
  const contacts = useContacts();
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const today = todayKey();
  const lp = useListPrefs('contacts', 'name');
  const reorder = useReorder('contacts', [['contacts']]);
  const list = useMemo(() => sortList((contacts.data ?? []).filter((c) => (!cat || c.category === cat) &&
    (!q || `${c.name} ${c.organization ?? ''} ${c.email ?? ''}`.toLocaleLowerCase('en').includes(q.toLocaleLowerCase('en')))), lp.mode, { date: (c) => c.last_contact_at, desc: true, name: (c) => c.name }), [contacts.data, cat, q, lp.mode]);
  const due = (contacts.data ?? []).filter((c) => c.follow_up_date && c.follow_up_date <= addDays(today, 7)).sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!));
  const selected = contacts.data?.find((c) => c.id === sel);

  return (
    <>
      <PageHead title="Contacts"><button type="button" className="btn btn-primary" onClick={() => setEdit({})}><Plus size={15} />New contact</button></PageHead>
      {due.length > 0 && (
        <section className="glass panel">
          <div className="panel-head"><h2>Follow-ups due</h2><span className="count">{due.length}</span></div>
          <div className="row">{due.map((c) => <button type="button" key={c.id} className="chip" style={{ cursor: 'pointer', padding: '6px 12px', borderColor: c.follow_up_date! < today ? 'var(--orange-500)' : undefined }} onClick={() => setSel(c.id)}><CalendarClock size={13} />{c.name} · {formatRelative(c.follow_up_date!)}</button>)}</div>
        </section>
      )}
      <div className="glass panel" style={{ padding: 14 }}>
        <div className="row">
          <input id="cq" className="input" style={{ flex: '1 1 200px', width: 'auto' }} placeholder="Search contact, organization or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <SortPicker id="csort" mode={lp.mode} onChange={lp.setMode} options={['manual', 'name', 'date']} />
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>All</button>
            {(Object.keys(CONTACT_CATEGORY_LABEL) as ContactCategory[]).filter((k) => k !== 'other').map((k) => <button type="button" key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{CONTACT_CATEGORY_LABEL[k]}</button>)}
          </div>
        </div>
      </div>
      <div className="day-grid">
        <section className="glass panel">
          {contacts.isLoading ? <p className="muted">Loading…</p> : list.length === 0 ? <Empty title="No contacts yet">Collectors, galleries, curators…</Empty> : (
            <DragList ids={list.map((c) => c.id)} enabled={lp.mode === 'manual'} onMove={(a, b) => reorder(list.map((c) => c.id), a, b)}>
            <div className="task-list">
              {list.map((c) => (
                <DragRow key={c.id} id={c.id} enabled={lp.mode === 'manual'}>
                <div className="task-row" onClick={() => setSel(c.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(c.id)} style={sel === c.id ? { background: '#fff', boxShadow: '0 0 0 2px var(--rose-300)' } : undefined}>
                  <div className="t">
                    <b>{c.name}</b>
                    <div className="meta">
                      <span className="chip" style={{ padding: '1px 8px' }}>{CONTACT_CATEGORY_LABEL[c.category]}</span>
                      {c.organization && <span>{c.organization}</span>}
                      {c.last_contact_at && <span>Last contact: {formatRelative(dayKeyOf(c.last_contact_at))}</span>}
                      {c.follow_up_date && <span style={{ color: c.follow_up_date < today ? 'var(--orange-600)' : undefined }}>Follow-up: {formatRelative(c.follow_up_date)}</span>}
                    </div>
                  </div>
                </div>
                </DragRow>
              ))}
            </div>
            </DragList>
          )}
        </section>
        {selected ? <ContactDetail c={selected} onEdit={() => setEdit(selected)} /> : <section className="glass panel"><p className="muted small">Select a contact to see details.</p></section>}
      </div>
      {edit && <ContactEditor draft={edit} onClose={() => setEdit(null)} onSaved={(id) => setSel(id)} />}
    </>
  );
}

function ContactDetail({ c, onEdit }: { c: Contact; onEdit: () => void }) {
  const inter = useInteractions({ contactId: c.id });
  const projects = useProjects();
  const pcs = useProjectContacts();
  const linkMut = useRowMutation('project_contacts', ['project_contacts']);
  const saveContact = useSaveContact();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const linked = (pcs.data ?? []).filter((p) => p.contact_id === c.id);
  return (
    <section className="glass panel" style={{ display: 'grid', gap: 14 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}><div><h2>{c.name}</h2><span className="small muted">{CONTACT_CATEGORY_LABEL[c.category]}{c.organization ? ` · ${c.organization}` : ''}</span></div><button type="button" className="btn btn-glass btn-sm" onClick={onEdit}><Pencil size={13} />Edit</button></div>
      <TagPicker type="contact" id={c.id} />
      <div className="row small" style={{ gap: 14 }}>
        {c.email && <span className="row" style={{ gap: 4 }}><Mail size={13} /><span style={{ userSelect: 'all' }}>{c.email}</span></span>}
        {c.phone && <span className="row" style={{ gap: 4 }}><Phone size={13} /><span style={{ userSelect: 'all' }}>{c.phone}</span></span>}
        {c.website && <a className="row" style={{ gap: 4 }} href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer"><Globe size={13} />{c.website.replace(/^https?:\/\//, '')}</a>}
        {Object.entries(c.socials ?? {}).filter(([, v]) => v).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
      </div>
      {c.expected_response && <div className="card small"><b>Expected reply:</b> {c.expected_response}</div>}
      <div className="row small">
        <span>Follow-up date:</span>
        <input id="c-fu" type="date" className="input" style={{ width: 'auto', padding: '6px 10px' }} value={c.follow_up_date ?? ''} onChange={(e) => saveContact.mutate({ id: c.id, name: c.name, follow_up_date: e.target.value || null }, { onSuccess: () => toast.ok('Follow-up date added to the calendar'), onError: (x) => toast.fail(x) })} />
      </div>
      {c.notes && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.notes}</p>}
      <div>
        <b className="small">Related projects</b>
        <div className="row" style={{ marginTop: 6 }}>
          {linked.map((l) => { const p = projects.data?.find((x) => x.id === l.project_id); return p && <span key={l.id} className="chip"><i className="dot" style={{ background: p.color }} />{p.title}<button type="button" aria-label="Remove link" onClick={() => linkMut.mutate({ op: 'hard_delete', id: l.id })} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>×</button></span>; })}
          <select id="c-link" className="select" style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }} value="" onChange={(e) => e.target.value && linkMut.mutate({ op: 'insert', row: { project_id: e.target.value, contact_id: c.id } }, { onError: (x) => toast.fail(x) })}>
            <option value="">Link to project…</option>
            {projects.data?.filter((p) => !linked.some((l) => l.project_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Contact history</b><button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={13} />Add conversation</button></div>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {inter.data?.length === 0 && <p className="small muted">No records yet.</p>}
          {inter.data?.map((i) => (
            <div key={i.id} className="card">
              <div className="small muted">{INTERACTION_LABEL[i.kind]} · {formatShort(dayKeyOf(i.occurred_at))} {hhmm(minutesOf(i.occurred_at))}{i.project_id && ` · ${projects.data?.find((p) => p.id === i.project_id)?.title ?? ''}`}</div>
              <b style={{ fontWeight: 600 }}>{i.summary}</b>
              {i.notes && <p className="small" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{i.notes}</p>}
            </div>
          ))}
        </div>
      </div>
      {adding && <InteractionEditor contact={c} onClose={() => setAdding(false)} />}
    </section>
  );
}

function InteractionEditor({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const save = useSaveInteraction();
  const saveTask = useSaveTask();
  const saveContact = useSaveContact();
  const projects = useProjects();
  const toast = useToast();
  const [f, setF] = useState({ kind: 'meeting' as InteractionKind, day: todayKey(), time: hhmm(Math.floor(minutesOf(new Date()) / 15) * 15), summary: '', notes: '', project_id: '', followTitle: '', followDay: addDays(todayKey(), 7) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.summary.trim()) return toast.fail(new Error('Write a short summary.'));
    const m = parseHHMM(f.time) ?? 600;
    try {
      await save.mutateAsync({ contact_id: contact.id, kind: f.kind, occurred_at: toInstant(f.day, m), summary: f.summary.trim(), notes: f.notes.trim() || null, project_id: f.project_id || null });
      if (f.followTitle.trim()) {
        await saveTask.mutateAsync({ title: f.followTitle.trim(), due_date: f.followDay, contact_id: contact.id, project_id: f.project_id || null, category: 'Meeting', priority: 'high' });
        await saveContact.mutateAsync({ id: contact.id, name: contact.name, follow_up_date: f.followDay });
      }
      toast.ok(f.followTitle.trim() ? 'Conversation and follow-up task added' : 'Conversation added'); onClose();
    } catch (x) { toast.fail(x); }
  }
  return (
    <Dialog title={`${contact.name} · conversation`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div className="grid-3">
          <Field label="Type"><select id="i-kind" className="select" value={f.kind} onChange={set('kind')}>{Object.entries(INTERACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Date"><input id="i-day" type="date" className="input" value={f.day} onChange={set('day')} /></Field>
          <Field label="Time"><input id="i-time" type="time" className="input" value={f.time} onChange={set('time')} /></Field>
        </div>
        <Field label="Summary"><input id="i-sum" className="input" value={f.summary} onChange={set('summary')} placeholder="e.g. Reserved two artworks for the exhibition" /></Field>
        <Field label="Meeting notes"><textarea id="i-notes" className="textarea" value={f.notes} onChange={set('notes')} /></Field>
        <Field label="Project"><select id="i-proj" className="select" value={f.project_id} onChange={set('project_id')}><option value="">No project</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <b className="small">Follow-up task (optional) · added to the calendar</b>
          <div className="grid-2">
            <Field label="Task"><input id="i-ft" className="input" value={f.followTitle} onChange={set('followTitle')} placeholder="e.g. Send the price list" /></Field>
            <Field label="Date"><input id="i-fd" type="date" className="input" value={f.followDay} onChange={set('followDay')} /></Field>
          </div>
        </div>
        <div className="foot"><span /><div className="row"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div></div>
      </form>
    </Dialog>
  );
}

function ContactEditor({ draft, onClose, onSaved }: { draft: Partial<Contact>; onClose: () => void; onSaved: (id: string) => void }) {
  const save = useSaveContact();
  const del = useSoftDelete('contacts');
  const toast = useToast();
  const s0 = draft.socials ?? {};
  const [f, setF] = useState({ name: draft.name ?? '', category: (draft.category ?? 'collector') as ContactCategory, organization: draft.organization ?? '', email: draft.email ?? '', phone: draft.phone ?? '', website: draft.website ?? '', instagram: s0.instagram ?? '', x: s0.x ?? '', expected_response: draft.expected_response ?? '', notes: draft.notes ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast.fail(new Error('Name can’t be empty.'));
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.fail(new Error('The email address doesn’t look valid.'));
    try {
      const c = await save.mutateAsync({ id: draft.id, name: f.name.trim(), category: f.category, organization: f.organization.trim() || null, email: f.email.trim() || null, phone: f.phone.trim() || null, website: f.website.trim() || null,
        socials: { instagram: f.instagram.trim(), x: f.x.trim() }, expected_response: f.expected_response.trim() || null, notes: f.notes.trim() || null });
      toast.ok(draft.id ? 'Contact updated' : 'Contact added'); onSaved(c.id); onClose();
    } catch (x) { toast.fail(x); }
  }
  return (
    <Dialog title={draft.id ? 'Edit contact' : 'New contact'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div className="grid-2">
          <Field label="Full name"><input id="c-name" className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Category"><select id="c-cat" className="select" value={f.category} onChange={set('category')}>{Object.entries(CONTACT_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Organization / gallery"><input id="c-org" className="input" value={f.organization} onChange={set('organization')} /></Field>
          <Field label="Email"><input id="c-email" type="email" className="input" value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><input id="c-phone" className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Website"><input id="c-web" className="input" value={f.website} onChange={set('website')} /></Field>
          <Field label="Instagram"><input id="c-ig" className="input" value={f.instagram} onChange={set('instagram')} placeholder="@kullanici" /></Field>
          <Field label="X"><input id="c-x" className="input" value={f.x} onChange={set('x')} placeholder="@kullanici" /></Field>
        </div>
        <Field label="Expected reply"><input id="c-exp" className="input" value={f.expected_response} onChange={set('expected_response')} placeholder="e.g. Reply about the portfolio" /></Field>
        <Field label="Notes"><textarea id="c-notes" className="textarea" value={f.notes} onChange={set('notes')} /></Field>
        <div className="foot">
          <div>{draft.id && <ConfirmButton label="Delete" confirmText="Move this contact to trash?" onConfirm={async () => { try { await del.mutateAsync(draft.id!); toast.ok('Contact deleted'); onClose(); } catch (x) { toast.fail(x); } }} />}</div>
          <div className="row"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>Save</button></div>
        </div>
      </form>
    </Dialog>
  );
}
