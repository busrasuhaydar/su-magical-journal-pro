// Veri katmanı: tüm ekranlar aynı tabloları okur; değişiklikler Realtime ile her yere yansır.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase, sha256, slugify } from './supabase';
import { addDays, addMonths, toInstant, todayKey, type DayKey } from './dates';
import type { CalEvent, CalendarEntry, FileRec, Holiday, JournalBlock, JournalDay, Profile, Project, ProjectProgress, Task } from './types';

export const queryClient = new QueryClient({ defaultOptions: {
  // offlineFirst: çevrimdışıyken önbellekteki (IndexedDB) veri gösterilir; yazmalar her zaman çalışır (kuyruğa düşer)
  queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1, networkMode: 'offlineFirst', gcTime: 7 * 24 * 3600_000 },
  mutations: { networkMode: 'always' },
} });

async function run<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

// ── Oturum ─────────────────────────────────────────────
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

// ── Realtime: tablo değişince ilgili sorguları yenile ──
const TABLE_KEYS: Record<string, string[][]> = {
  tasks: [['cal'], ['tasks'], ['year'], ['progress'], ['history']],
  events: [['cal'], ['year']],
  projects: [['projects'], ['progress']],
  journal_days: [['journal']],
  journal_blocks: [['journal']],
  files: [['files'], ['journal']],
  file_links: [['files']],
  reminders: [['reminders']],
  profiles: [['profile']],
  social_posts: [['posts'], ['year'], ['cal']],
  post_targets: [['posts'], ['cal']],
  contacts: [['contacts'], ['year']],
  project_contacts: [['project_contacts']],
  interactions: [['interactions'], ['contacts']],
  project_stages: [['stages']],
  ideas: [['ideas']],
  notes: [['notes']],
  memory_entries: [['memory']],
  notifications: [['notifications']],
  social_accounts: [['social_accounts']],
  pages: [['pages']],
  page_blocks: [['blocks']],
  entity_links: [['links']],
  opportunities: [['opps'], ['year']],
  opportunity_dates: [['opps'], ['year'], ['cal']],
  project_opportunities: [['opps']],
  backups: [['backups']],
  inbox_items: [['inbox']],
  artworks: [['artworks']],
  application_kit: [['kit']],
};
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase.channel('journal-sync');
    for (const table of Object.keys(TABLE_KEYS)) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        TABLE_KEYS[table].forEach((k) => qc.invalidateQueries({ queryKey: k }));
      });
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, qc]);
}

// ── Profile ─────────────────────────────────────────────
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      return run<Profile>(supabase.from('profiles').select('*').eq('id', u.user!.id).single());
    },
  });
}
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data: u } = await supabase.auth.getUser();
      return run(supabase.from('profiles').update(patch).eq('id', u.user!.id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

// ── Calendar aralığı ─────────────────────────────────────
export type CalOppDate = import('./types').OppDate & { opportunities: { title: string; status: import('./types').OppStatus } | null };
export interface CalExtra { id: string; day: DayKey; label: string; kind: 'followup' | 'milestone' | 'project' | 'repeat'; href?: string }
export interface CalData { tasks: Task[]; events: CalEvent[]; posts: import('./types').SocialPost[]; oppDates: CalOppDate[]; extras: CalExtra[] }
/** Recurring görevin (ör. 15 günde bir) aralıktaki gelecek örnekleri. */
function projectRepeats(t: Task, from: DayKey, to: DayKey): CalExtra[] {
  if (!t.rrule || !t.due_date) return [];
  const freq = /FREQ=([A-Z]+)/.exec(t.rrule)?.[1], n = Number(/INTERVAL=(\d+)/.exec(t.rrule)?.[1] ?? 1);
  const out: CalExtra[] = [];
  let k = t.due_date;
  for (let i = 0; i < 400; i++) {
    k = freq === 'DAILY' ? addDays(k, n) : freq === 'WEEKLY' ? addDays(k, 7 * n) : freq === 'MONTHLY' ? addMonths(k, n) : addMonths(k, 12 * n);
    if (k > to) break;
    if (k >= from) out.push({ id: `rep-${t.id}-${k}`, day: k, label: `↻ ${t.title}`, kind: 'repeat' });
  }
  return out;
}
export function useCalendarRange(from: DayKey, to: DayKey) {
  return useQuery({
    queryKey: ['cal', from, to],
    queryFn: async (): Promise<CalData> => {
      const start = toInstant(from, 0), end = toInstant(addDays(to, 1), 0);
      const [timed, dated, events, posts, oppDates, contacts, stages, projs, repeating] = await Promise.all([
        run<Task[]>(supabase.from('tasks').select('*').is('deleted_at', null).lt('starts_at', end).gte('ends_at', start)),
        run<Task[]>(supabase.from('tasks').select('*').is('deleted_at', null).is('starts_at', null).gte('due_date', from).lte('due_date', to)),
        run<CalEvent[]>(supabase.from('events').select('*').is('deleted_at', null).lt('starts_at', end).gte('ends_at', start)),
        run<import('./types').SocialPost[]>(supabase.from('social_posts').select('*, post_targets(*)').is('deleted_at', null).gte('scheduled_at', start).lt('scheduled_at', end)),
        run<CalOppDate[]>(supabase.from('opportunity_dates').select('*, opportunities!inner(title,status,deleted_at)').is('opportunities.deleted_at', null).gte('day', from).lte('day', to)),
        run<{ id: string; name: string; follow_up_date: string }[]>(supabase.from('contacts').select('id,name,follow_up_date').is('deleted_at', null).gte('follow_up_date', from).lte('follow_up_date', to)),
        run<{ id: string; title: string; due_date: string; project_id: string; projects: { slug: string; title: string }[] | { slug: string; title: string } | null }[]>(supabase.from('project_stages').select('id,title,due_date,project_id,projects(slug,title)').is('deleted_at', null).gte('due_date', from).lte('due_date', to)),
        run<{ id: string; title: string; slug: string; target_date: string }[]>(supabase.from('projects').select('id,title,slug,target_date').is('deleted_at', null).neq('status', 'completed').gte('target_date', from).lte('target_date', to)),
        run<Task[]>(supabase.from('tasks').select('*').is('deleted_at', null).not('rrule', 'is', null).in('status', ['todo', 'doing']).not('due_date', 'is', null)),
      ]);
      const extras: CalExtra[] = [
        ...contacts.map((c) => ({ id: `fu-${c.id}`, day: c.follow_up_date, label: `☺ Follow-up: ${c.name}`, kind: 'followup' as const, href: 'contacts' })),
        ...stages.map((x) => { const pr = Array.isArray(x.projects) ? x.projects[0] : x.projects; return { id: `st-${x.id}`, day: x.due_date, label: `◆ ${x.title}${pr ? ` · ${pr.title}` : ''}`, kind: 'milestone' as const, href: pr ? `projects/${pr.slug}` : undefined }; }),
        ...projs.map((x) => ({ id: `pj-${x.id}`, day: x.target_date, label: `⚑ Goal: ${x.title}`, kind: 'project' as const, href: `projects/${x.slug}` })),
        ...repeating.flatMap((t) => projectRepeats(t, from, to)),
      ];
      return { tasks: [...timed, ...dated], events, posts, oppDates, extras };
    },
  });
}

/** Yıllık görünüm: v_calendar_entries görünümünden tek sorgu. */
export function useYearEntries(year: number) {
  return useQuery({
    queryKey: ['year', year],
    queryFn: () => run<CalendarEntry[]>(supabase.from('v_calendar_entries').select('*')
      .gte('starts_at', toInstant(`${year}-01-01`, 0)).lt('starts_at', toInstant(`${year + 1}-01-01`, 0))),
  });
}

export function useHolidays(from: DayKey, to: DayKey) {
  const q = useQuery({
    queryKey: ['holidays', from, to],
    staleTime: Infinity,
    queryFn: () => run<Holiday[]>(supabase.from('holidays').select('*').in('country', ['TR', 'US']).gte('day', from).lte('day', to).order('day').limit(5000)),
  });
  const list = (q.data ?? []).filter((h) => h.country === 'TR' || h.country === 'US');
  const byDay = new Map<DayKey, Holiday[]>();
  for (const h of list) byDay.set(h.day, [...(byDay.get(h.day) ?? []), h]);
  return { ...q, list, byDay };
}

// ── Tasks ───────────────────────────────────────────
export function useTasks() {
  return useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => run<Task[]>(supabase.from('tasks').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(2000)),
  });
}
/** Overdue, bitmemiş görevler (asla kaybolmaz). */
export function useOverdue() {
  return useQuery({
    queryKey: ['tasks', 'overdue'],
    queryFn: async () => {
      const today = todayKey(), nowIso = new Date().toISOString();
      const [a, b] = await Promise.all([
        run<Task[]>(supabase.from('tasks').select('*').is('deleted_at', null).in('status', ['todo', 'doing', 'postponed']).lt('ends_at', nowIso)),
        run<Task[]>(supabase.from('tasks').select('*').is('deleted_at', null).in('status', ['todo', 'doing', 'postponed']).is('starts_at', null).lt('due_date', today)),
      ]);
      return [...a, ...b];
    },
    refetchInterval: 5 * 60_000,
  });
}

function invalidateTasks(qc: ReturnType<typeof useQueryClient>) {
  ['cal', 'tasks', 'year', 'progress'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export type TaskInput = Partial<Task> & { title: string; reminderMinutes?: number | null };
export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reminderMinutes, ...t }: TaskInput) => {
      const row = { ...t };
      delete (row as Partial<Task>).created_at; delete (row as Partial<Task>).updated_at;
      const saved = await run<Task>(t.id
        ? supabase.from('tasks').update(row).eq('id', t.id).select().single()
        : supabase.from('tasks').insert(row).select().single());
      if (reminderMinutes != null) {
        await run(supabase.from('reminders').delete().eq('task_id', saved.id).is('sent_at', null));
        const base = saved.starts_at ?? (saved.due_date ? toInstant(saved.due_date, 9 * 60) : null);
        if (base && reminderMinutes >= 0) {
          await run(supabase.from('reminders').insert({ task_id: saved.id, remind_at: new Date(new Date(base).getTime() - reminderMinutes * 60000).toISOString() }));
        }
      }
      return saved;
    },
    onSuccess: () => invalidateTasks(qc),
  });
}
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      if (done) return run(supabase.rpc('complete_task', { p_id: id }));
      return run(supabase.from('tasks').update({ status: 'todo', completed_at: null }).eq('id', id));
    },
    onSuccess: () => invalidateTasks(qc),
  });
}
export function usePostponeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starts_at, ends_at, due_date }: { id: string; starts_at: string | null; ends_at: string | null; due_date: string | null }) =>
      run(supabase.rpc('postpone_task', { p_id: id, p_starts: starts_at, p_ends: ends_at, p_due: due_date })),
    onSuccess: () => invalidateTasks(qc),
  });
}
export function useSoftDelete(table: 'tasks' | 'events' | 'projects' | 'journal_blocks' | 'files' | 'social_posts' | 'contacts' | 'ideas' | 'notes' | 'project_stages' | 'interactions') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => run(supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    onSuccess: () => { invalidateTasks(qc); ['projects', 'journal', 'files', 'posts', 'contacts', 'ideas', 'notes', 'stages', 'interactions'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
  });
}

// ── Etkinlikler ────────────────────────────────────────
export function useSaveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: Partial<CalEvent> & { title: string; starts_at: string; ends_at: string }) =>
      run<CalEvent>(e.id ? supabase.from('events').update(e).eq('id', e.id).select().single() : supabase.from('events').insert(e).select().single()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cal'] }); qc.invalidateQueries({ queryKey: ['year'] }); },
  });
}

// ── Projects ───────────────────────────────────────────
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => run<Project[]>(supabase.from('projects').select('*').is('deleted_at', null).order('updated_at', { ascending: false })),
  });
}
export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: async () => {
      const rows = await run<ProjectProgress[]>(supabase.from('v_project_progress').select('*'));
      return new Map(rows.map((r) => [r.project_id, r]));
    },
  });
}
export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<Project> & { title: string; slug: string }) =>
      run<Project>(p.id ? supabase.from('projects').update(p).eq('id', p.id).select().single() : supabase.from('projects').insert(p).select().single()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['progress'] }); },
  });
}

// ── Files ───────────────────────────────────────────
export function useFiles() {
  return useQuery({
    queryKey: ['files'],
    queryFn: () => run<FileRec[]>(supabase.from('files').select('*').is('deleted_at', null).order('created_at', { ascending: false })),
  });
}
export function useFileLinks() {
  return useQuery({
    queryKey: ['files', 'links'],
    queryFn: () => run<import('./types').FileLink[]>(supabase.from('file_links').select('*').order('position')),
  });
}

/** Dosyayı bir kez yükler: aynı içerik (sha256) varsa mevcut kaydı döndürür. */
export async function uploadFile(file: File): Promise<{ rec: FileRec; reused: boolean }> {
  const hash = await sha256(file);
  const existing = await run<FileRec[]>(supabase.from('files').select('*').eq('sha256', hash).limit(1));
  if (existing.length) {
    if (existing[0].storage_path && (existing[0] as FileRec & { deleted_at?: string }).deleted_at) {
      await run(supabase.from('files').update({ deleted_at: null }).eq('id', existing[0].id));
    }
    return { rec: existing[0], reused: true };
  }
  const { data: u } = await supabase.auth.getUser();
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const path = `${u.user!.id}/${hash.slice(0, 2)}/${hash}.${ext}`;
  const up = await supabase.storage.from('files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (up.error) throw up.error;
  const rec = await run<FileRec>(supabase.from('files').insert({
    storage_path: path, title: file.name, mime: file.type || 'application/octet-stream', size: file.size, sha256: hash,
  }).select().single());
  return { rec, reused: false };
}
export async function linkFile(file_id: string, entity_type: string, entity_id: string) {
  const { error } = await supabase.from('file_links').upsert({ file_id, entity_type, entity_id }, { onConflict: 'file_id,entity_type,entity_id', ignoreDuplicates: true });
  if (error) throw error;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await supabase.storage.from('files').createSignedUrl(path, 3600);
  if (error) throw error;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}
export function useSignedUrl(path?: string | null) {
  return useQuery({ queryKey: ['signed', path], enabled: !!path, staleTime: 45 * 60_000, queryFn: () => signedUrl(path!) });
}

// ── Journal ─────────────────────────────────────────────
export function useJournal(day: DayKey) {
  return useQuery({
    queryKey: ['journal', day],
    queryFn: async () => {
      const days = await run<JournalDay[]>(supabase.from('journal_days').select('*').eq('day', day).limit(1));
      const jd = days[0] ?? null;
      const blocks = jd ? await run<JournalBlock[]>(supabase.from('journal_blocks').select('*').eq('day_id', jd.id).is('deleted_at', null).order('position')) : [];
      return { day: jd, blocks };
    },
  });
}
export async function ensureJournalDay(day: DayKey): Promise<JournalDay> {
  return run<JournalDay>(supabase.from('journal_days').upsert({ day }, { onConflict: 'owner_id,day' }).select().single());
}
export function useJournalGoals(from: DayKey, to: DayKey) {
  return useQuery({
    queryKey: ['journal', 'goals', from, to],
    queryFn: () => run<JournalDay[]>(supabase.from('journal_days').select('*').gte('day', from).lte('day', to)),
  });
}

// ══ Faz 2 ══════════════════════════════════════════════
import type { ChangeLogRow, Contact, Idea, Interaction, MemoryEntry, Note, PostTarget, ProjectContact, SocialPost, Stage } from './types';

function invalidate(qc: ReturnType<typeof useQueryClient>, ...keys: string[]) { keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }

// ── Social media ───────────────────────────────────────
export function usePosts(filter?: { projectId?: string }) {
  return useQuery({
    queryKey: ['posts', filter?.projectId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('social_posts').select('*, post_targets(*)').is('deleted_at', null);
      if (filter?.projectId) q = q.eq('project_id', filter.projectId);
      return run<SocialPost[]>(q.order('scheduled_at', { ascending: true, nullsFirst: false }).limit(1000));
    },
  });
}
export function usePostsRange(from: DayKey, to: DayKey) {
  return useQuery({
    queryKey: ['posts', 'range', from, to],
    queryFn: () => run<SocialPost[]>(supabase.from('social_posts').select('*, post_targets(*)').is('deleted_at', null)
      .gte('scheduled_at', toInstant(from, 0)).lt('scheduled_at', toInstant(addDays(to, 1), 0)).order('scheduled_at')),
  });
}
export type PostInput = Partial<SocialPost> & { title: string; platforms: string[] };
export function useSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ platforms, post_targets: _t, ...p }: PostInput) => {
      void _t;
      const row = { ...p }; delete row.created_at; delete row.updated_at;
      const saved = await run<SocialPost>(p.id ? supabase.from('social_posts').update(row).eq('id', p.id).select().single() : supabase.from('social_posts').insert(row).select().single());
      const existing = await run<PostTarget[]>(supabase.from('post_targets').select('*').eq('post_id', saved.id));
      const toRemove = existing.filter((t) => !platforms.includes(t.platform) && t.status !== 'published');
      if (toRemove.length) await run(supabase.from('post_targets').delete().in('id', toRemove.map((t) => t.id)));
      const toAdd = platforms.filter((pl) => !existing.some((t) => t.platform === pl));
      if (toAdd.length) await run(supabase.from('post_targets').insert(toAdd.map((platform) => ({ post_id: saved.id, platform, status: saved.status === 'published' ? 'draft' : saved.status }))));
      // Yayınlanmamış hedeflerin durumu içerikle aynı kalır
      if (saved.status !== 'published') await run(supabase.from('post_targets').update({ status: saved.status }).eq('post_id', saved.id).neq('status', 'published'));
      return saved;
    },
    onSuccess: () => invalidate(qc, 'posts', 'year', 'cal'),
  });
}
export function useMarkPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId, url }: { targetId: string; url: string }) => run(supabase.rpc('mark_target_published', { p_target: targetId, p_url: url })),
    onSuccess: () => invalidate(qc, 'posts', 'year'),
  });
}

// ── Contacts ────────────────────────────────────────────
export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: () => run<Contact[]>(supabase.from('contacts').select('*').is('deleted_at', null).order('name')) });
}
export function useSaveContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Partial<Contact> & { name: string }) => {
      const row = { ...c }; delete row.created_at;
      return run<Contact>(c.id ? supabase.from('contacts').update(row).eq('id', c.id).select().single() : supabase.from('contacts').insert(row).select().single());
    },
    onSuccess: () => invalidate(qc, 'contacts', 'year'),
  });
}
export function useInteractions(by: { contactId?: string; projectId?: string }) {
  return useQuery({
    queryKey: ['interactions', by.contactId ?? '', by.projectId ?? ''],
    queryFn: () => {
      let q = supabase.from('interactions').select('*').is('deleted_at', null);
      if (by.contactId) q = q.eq('contact_id', by.contactId);
      if (by.projectId) q = q.eq('project_id', by.projectId);
      return run<Interaction[]>(q.order('occurred_at', { ascending: false }).limit(300));
    },
  });
}
export function useSaveInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: Partial<Interaction> & { contact_id: string; summary: string }) => run<Interaction>(supabase.from('interactions').insert(i).select().single()),
    onSuccess: () => invalidate(qc, 'interactions', 'contacts'),
  });
}
export function useProjectContacts() {
  return useQuery({ queryKey: ['project_contacts'], queryFn: () => run<ProjectContact[]>(supabase.from('project_contacts').select('*')) });
}

// ── Ideas ve notlar ─────────────────────────────────
export function useIdeas() {
  return useQuery({ queryKey: ['ideas'], queryFn: () => run<Idea[]>(supabase.from('ideas').select('*').is('deleted_at', null).order('created_at', { ascending: false })) });
}
export function useNotes(projectId: string) {
  return useQuery({ queryKey: ['notes', projectId], queryFn: () => run<Note[]>(supabase.from('notes').select('*').eq('project_id', projectId).is('deleted_at', null).order('created_at', { ascending: false })) });
}

// ── Project workspace ────────────────────────────────
export function useStages(projectId: string) {
  return useQuery({ queryKey: ['stages', projectId], queryFn: () => run<Stage[]>(supabase.from('project_stages').select('*').eq('project_id', projectId).is('deleted_at', null).order('position')) });
}
export function useMemory(projectId: string) {
  return useQuery({ queryKey: ['memory', projectId], queryFn: () => run<MemoryEntry[]>(supabase.from('memory_entries').select('*').eq('project_id', projectId).order('created_at', { ascending: false })) });
}
export function useProjectHistory(projectId: string) {
  return useQuery({
    queryKey: ['history', projectId],
    queryFn: () => run<ChangeLogRow[]>(supabase.from('change_log').select('*')
      .or(`row_id.eq.${projectId},after->>project_id.eq.${projectId},before->>project_id.eq.${projectId}`)
      .order('at', { ascending: false }).limit(200)),
  });
}
export function useProjectEvents(projectId: string) {
  return useQuery({ queryKey: ['cal', 'project', projectId], queryFn: () => run<CalEvent[]>(supabase.from('events').select('*').eq('project_id', projectId).is('deleted_at', null).order('starts_at')) });
}

/** Basit kayıt işlemleri (ekle / güncelle / yumuşak sil) için genel yardımcı. */
export function useRowMutation(table: string, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ op, id, row }: { op: 'insert' | 'update' | 'delete' | 'hard_delete'; id?: string; row?: Record<string, unknown> }) => {
      if (op === 'insert') return run(supabase.from(table).insert(row!).select().single());
      if (op === 'update') return run(supabase.from(table).update(row!).eq('id', id!).select().single());
      if (op === 'delete') return run(supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id!));
      return run(supabase.from(table).delete().eq('id', id!));
    },
    onSuccess: () => invalidate(qc, ...keys),
  });
}

export const useSoftDeletePost = () => useSoftDelete('social_posts');

// ══ Gelişmiş projeler + Faz 3 ══════════════════════════
import type { EntityLink, OppDate, Opportunity, Page, PageBlock } from './types';
export function usePages(projectId: string) {
  return useQuery({ queryKey: ['pages', projectId], queryFn: () => run<Page[]>(supabase.from('pages').select('*').eq('project_id', projectId).is('deleted_at', null).order('position')) });
}
export function useAllPages() {
  return useQuery({ queryKey: ['pages', 'all'], queryFn: () => run<Page[]>(supabase.from('pages').select('id,project_id,title,icon,parent_id,position,updated_at,artwork_key,journal_day').is('deleted_at', null)) });
}
/** Günlük sayfası (Day.tsx): o güne ait pages kaydı. */
export function useJournalPage(day: DayKey) {
  return useQuery({ queryKey: ['pages', 'journal', day], queryFn: async () => (await run<Page[]>(supabase.from('pages').select('*').eq('journal_day', day).is('deleted_at', null).limit(1)))[0] ?? null });
}
export async function ensureJournalPage(day: DayKey, title: string): Promise<Page> {
  return run<Page>(supabase.from('pages').upsert({ journal_day: day, title, icon: '📔', project_id: null, position: 0 }, { onConflict: 'owner_id,journal_day' }).select().single());
}
/** Sayfanın adresi: projede ise proje sekmesi, değilse /pages. */
export function pageHref(pg: { id: string; project_id: string | null; journal_day?: string | null } | undefined, projects: Project[] | undefined) {
  if (!pg) return '/pages';
  if (pg.journal_day) return `/day/${pg.journal_day}`;
  const p = pg.project_id ? projects?.find((x) => x.id === pg.project_id) : undefined;
  return p ? `/projects/${p.slug}/pages/${pg.id}` : `/pages/${pg.id}`;
}
export function usePageBlocks(pageId: string | null) {
  return useQuery({ queryKey: ['blocks', pageId], enabled: !!pageId, queryFn: () => run<PageBlock[]>(supabase.from('page_blocks').select('*').eq('page_id', pageId!).order('position')) });
}
export function useEntityLinks() {
  return useQuery({ queryKey: ['links'], queryFn: () => run<EntityLink[]>(supabase.from('entity_links').select('*').limit(5000)) });
}
export function useOpportunities() {
  return useQuery({ queryKey: ['opps', 'list'], queryFn: () => run<Opportunity[]>(supabase.from('opportunities').select('*').is('deleted_at', null).order('created_at', { ascending: false })) });
}
export function useOppDates() {
  return useQuery({ queryKey: ['opps', 'dates'], queryFn: () => run<OppDate[]>(supabase.from('opportunity_dates').select('*').order('day')) });
}
export function useProjectOpps() {
  return useQuery({ queryKey: ['opps', 'links'], queryFn: () => run<{ id: string; project_id: string; opportunity_id: string }[]>(supabase.from('project_opportunities').select('*')) });
}
/** Dosyayı projeye galeriye ekler (sonuna). */
export async function addToGallery(fileId: string, projectId: string) {
  const { data } = await supabase.from('file_links').select('position').eq('entity_type', 'project').eq('entity_id', projectId).order('position', { ascending: false }).limit(1);
  const pos = (data?.[0]?.position ?? 0) + 1;
  const { error } = await supabase.from('file_links').upsert({ file_id: fileId, entity_type: 'project', entity_id: projectId, position: pos }, { onConflict: 'file_id,entity_type,entity_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Birden çok dosyayı projenin galerisine ekler (zaten varsa atlar). */
export async function addManyToGallery(fileIds: string[], projectId: string) {
  for (const id of fileIds) await addToGallery(id, projectId);
}
/** Dosyaları projenin galerisinden çıkarır (dosya silinmez). */
export async function removeFromProject(fileIds: string[], projectId: string) {
  if (!fileIds.length) return;
  const { error } = await supabase.from('file_links').delete().eq('entity_type', 'project').eq('entity_id', projectId).in('file_id', fileIds);
  if (error) throw error;
}
/** Move: kaynak projeden çıkarır, hedefe ekler. */
export async function moveFiles(fileIds: string[], fromProjectId: string | null, toProjectId: string) {
  await addManyToGallery(fileIds, toProjectId);
  if (fromProjectId && fromProjectId !== toProjectId) await removeFromProject(fileIds, fromProjectId);
}
/** Dosyaları Files'dan da kaldırır (yumuşak silme; bağlantılar kalır, ama dosya hiçbir yerde listelenmez). */
export async function softDeleteFiles(fileIds: string[]) {
  if (!fileIds.length) return;
  const { error } = await supabase.from('files').update({ deleted_at: new Date().toISOString() }).in('id', fileIds);
  if (error) throw error;
}
/** Hızlı yeni proje: yalnız ad ile. */
export async function createQuickProject(title: string): Promise<Project> {
  const slug = `${slugify(title)}-${Date.now().toString(36).slice(-4)}`;
  return run<Project>(supabase.from('projects').insert({ title: title.trim(), slug }).select().single());
}

// ══ Faz 4 ══════════════════════════════════════════════
export interface AppNotification { id: string; kind: string; title: string; body: string | null; url: string | null; read_at: string | null; created_at: string }
export interface SocialAccount { id: string; platform: string; account_name: string | null; status: 'connected' | 'needs_reauth' | 'error'; connected_at: string }
export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => run<AppNotification[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)) });
}
export function useSocialAccounts() {
  return useQuery({ queryKey: ['social_accounts'], queryFn: () => run<SocialAccount[]>(supabase.from('social_accounts').select('id,platform,account_name,status,connected_at')) });
}
