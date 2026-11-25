-- 0019 · Önemli özellikler: özel tekrar kuralları, otomasyonlar, takvim eşitleme (ICS), çizim/buton blokları, günlük otomatik bilgi, ay sonu özeti.

-- ── 1. Özel tekrar kuralları (FREQ, INTERVAL, BYDAY=MO,WE | 2TU | -1FR, BYMONTHDAY=15 | -1) ──
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%rrule%';
  if c is not null then execute format('alter table tasks drop constraint %I', c); end if;
end $$;
alter table tasks add constraint tasks_rrule_check check (rrule is null or rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;(INTERVAL=[0-9]{1,3}|BYDAY=[+-]?[0-9]?(MO|TU|WE|TH|FR|SA|SU)(,[+-]?[0-9]?(MO|TU|WE|TH|FR|SA|SU))*|BYMONTHDAY=-?[0-9]{1,2}))*$');

create or replace function public.rrule_next(p_rule text, p_from date) returns date
language plpgsql immutable set search_path = public as $$
declare
  freq text := substring(p_rule from 'FREQ=([A-Z]+)');
  n int := greatest(coalesce(substring(p_rule from 'INTERVAL=([0-9]+)')::int, 1), 1);
  byday text := substring(p_rule from 'BYDAY=([^;]+)');
  bymd int := substring(p_rule from 'BYMONTHDAY=(-?[0-9]+)')::int;
  days text[] := array['MO','TU','WE','TH','FR','SA','SU'];
  k date := p_from; i int; wd int; dim int; ok boolean; part text; ord int; dname text;
begin
  for i in 1..2000 loop
    k := k + 1;
    wd := extract(isodow from k)::int - 1;
    dim := extract(day from (date_trunc('month', k) + interval '1 month - 1 day'))::int;
    if freq = 'DAILY' then ok := (k - p_from) % n = 0;
    elsif freq = 'WEEKLY' then
      ok := ((date_trunc('week', k)::date - date_trunc('week', p_from)::date) / 7) % n = 0
        and (case when byday is null then wd = extract(isodow from p_from)::int - 1 else days[wd + 1] = any(string_to_array(regexp_replace(byday, '[+0-9-]', '', 'g'), ',')) end);
    elsif freq = 'MONTHLY' then
      ok := ((extract(year from k) - extract(year from p_from)) * 12 + extract(month from k) - extract(month from p_from))::int % n = 0;
      if ok then
        if byday is not null then
          ok := false;
          foreach part in array string_to_array(byday, ',') loop
            dname := right(part, 2); ord := nullif(left(part, length(part) - 2), '')::int;
            if days[wd + 1] = dname and (ord is null
              or (ord > 0 and ceil(extract(day from k) / 7.0) = ord)
              or (ord < 0 and ceil((dim - extract(day from k) + 1) / 7.0) = -ord)) then ok := true; end if;
          end loop;
        elsif bymd is not null then
          ok := case when bymd > 0 then extract(day from k) = least(bymd, dim) else extract(day from k) = dim + 1 + bymd end;
        else ok := extract(day from k) = least(extract(day from p_from), dim);
        end if;
      end if;
    else
      ok := (extract(year from k) - extract(year from p_from))::int % n = 0 and extract(month from k) = extract(month from p_from)
        and extract(day from k) = least(extract(day from p_from), dim);
    end if;
    if ok then return k; end if;
  end loop;
  return null;
end $$;

create or replace function public.complete_task(p_id uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare t tasks; nxt uuid; base date; nd date; shift int;
begin
  update tasks set status = 'done', completed_at = now()
   where id = p_id and owner_id = auth.uid() and status <> 'done'
   returning * into t;
  if not found then return null; end if;
  if t.rrule is null then return null; end if;
  base := coalesce(t.due_date, (t.starts_at at time zone 'Europe/Istanbul')::date, current_date);
  nd := rrule_next(t.rrule, base);
  if nd is null then return null; end if;
  shift := nd - base;
  insert into tasks (owner_id, project_id, contact_id, title, description, due_date, starts_at, ends_at, priority, category, rrule, recurrence_parent, source)
  values (t.owner_id, t.project_id, t.contact_id, t.title, t.description,
          case when t.due_date is not null then nd end,
          case when t.starts_at is not null then t.starts_at + make_interval(days => shift) end,
          case when t.ends_at is not null then t.ends_at + make_interval(days => shift) end,
          t.priority, t.category, t.rrule, coalesce(t.recurrence_parent, t.id), 'recurrence')
  returning id into nxt;
  return nxt;
end $$;

-- ── 4. Otomasyonlar: "Eğer … ise …" kuralları ──
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Rule',
  enabled boolean not null default true,
  trigger jsonb not null,   -- {type:'status_changed'|'record_created'|'date_reached', table:'tasks'|'opportunities'|'projects', to?:status, days_before?:int}
  action jsonb not null,    -- {type:'create_task'|'set_status'|'add_tag'|'notify', title?, status?, tag_id?, message?, due_in_days?}
  last_run_at timestamptz,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists automations_owner on automations (owner_id) where deleted_at is null;
create table if not exists automation_runs (
  automation_id uuid not null references automations on delete cascade,
  entity_id uuid not null, day date not null default current_date,
  primary key (automation_id, entity_id, day)
);
alter table automations enable row level security;
alter table automation_runs enable row level security;
create policy "sahip_erisimi" on automations for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger automations_log after insert or update or delete on automations for each row execute function log_change();
create trigger automations_updated before update on automations for each row execute function set_updated_at();
alter publication supabase_realtime add table automations;

-- Eylemi uygular (tetikleyici ve tarih çalıştırıcısı ortak kullanır).
create or replace function public.automation_act(a automations, p_table text, p_row jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare act jsonb := a.action; ttl text; ent text;
begin
  ttl := replace(coalesce(nullif(act->>'title', ''), 'Follow up'), '{title}', coalesce(p_row->>'title', ''));
  if act->>'type' = 'create_task' then
    insert into tasks (owner_id, title, project_id, opportunity_id, due_date, priority, source)
    values (a.owner_id, left(ttl, 200),
      case when p_table = 'projects' then (p_row->>'id')::uuid when p_table = 'tasks' then (p_row->>'project_id')::uuid end,
      case when p_table = 'opportunities' then (p_row->>'id')::uuid end,
      current_date + coalesce((act->>'due_in_days')::int, 0), coalesce((act->>'priority')::priority, 'medium'), 'automation');
  elsif act->>'type' = 'set_status' and act->>'status' is not null then
    if p_table = 'tasks' then update tasks set status = (act->>'status')::task_status, completed_at = case when act->>'status' = 'done' then now() end where id = (p_row->>'id')::uuid and owner_id = a.owner_id;
    elsif p_table = 'opportunities' then update opportunities set status = (act->>'status')::opp_status where id = (p_row->>'id')::uuid and owner_id = a.owner_id;
    elsif p_table = 'projects' then update projects set status = (act->>'status')::project_status where id = (p_row->>'id')::uuid and owner_id = a.owner_id;
    end if;
  elsif act->>'type' = 'add_tag' and act->>'tag_id' is not null then
    ent := case p_table when 'tasks' then 'task' when 'opportunities' then 'opportunity' end;
    if ent is not null then
      insert into tag_links (owner_id, tag_id, entity_type, entity_id) values (a.owner_id, (act->>'tag_id')::uuid, ent, (p_row->>'id')::uuid)
      on conflict (tag_id, entity_type, entity_id) do update set deleted_at = null;
    end if;
  elsif act->>'type' = 'notify' then
    insert into notifications (owner_id, kind, title, body, url)
    values (a.owner_id, 'system', left(coalesce(nullif(replace(coalesce(act->>'message', ''), '{title}', coalesce(p_row->>'title', '')), ''), a.name), 200), coalesce(p_row->>'title', ''),
      case p_table when 'opportunities' then '/opportunities/' || (p_row->>'id') when 'tasks' then '/tasks' else '/projects' end);
  end if;
  update automations set last_run_at = now(), run_count = run_count + 1 where id = a.id;
end $$;
revoke all on function public.automation_act(automations, text, jsonb) from public, authenticated;

create or replace function public.run_automations() returns trigger
language plpgsql security definer set search_path = public as $$
declare a automations; nr jsonb := to_jsonb(new); orow jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if pg_trigger_depth() > 2 then return new; end if;   -- otomasyonun kendi değişikliği zincir oluşturmasın
  for a in select * from automations where owner_id = new.owner_id and enabled and deleted_at is null and trigger->>'table' = tg_table_name loop
    if (a.trigger->>'type' = 'record_created' and tg_op = 'INSERT' and coalesce(nr->>'source', '') <> 'automation')
      or (a.trigger->>'type' = 'status_changed' and tg_op = 'UPDATE' and (orow->>'status') is distinct from (nr->>'status')
          and (coalesce(a.trigger->>'to', '') = '' or a.trigger->>'to' = nr->>'status')) then
      perform automation_act(a, tg_table_name, nr);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists tasks_automations on tasks;
drop trigger if exists opportunities_automations on opportunities;
drop trigger if exists projects_automations on projects;
create trigger tasks_automations after insert or update of status on tasks for each row execute function run_automations();
create trigger opportunities_automations after insert or update of status on opportunities for each row execute function run_automations();
create trigger projects_automations after insert or update of status on projects for each row execute function run_automations();

-- Tarih tetikleyicileri: saatte bir (görev son günü / fırsat son başvuru N gün kala), her kayıt için günde bir kez.
create or replace function public.run_date_automations() returns int
language plpgsql security definer set search_path = public as $$
declare a automations; r record; n int := 0; d int; today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  for a in select * from automations where enabled and deleted_at is null and trigger->>'type' = 'date_reached' loop
    d := coalesce((a.trigger->>'days_before')::int, 0);
    if a.trigger->>'table' = 'tasks' then
      for r in select to_jsonb(t) j, t.id from tasks t where t.owner_id = a.owner_id and t.deleted_at is null and t.status in ('todo','doing','postponed') and t.due_date = today + d loop
        insert into automation_runs (automation_id, entity_id, day) values (a.id, r.id, today) on conflict do nothing;
        if found then perform automation_act(a, 'tasks', r.j); n := n + 1; end if;
      end loop;
    elsif a.trigger->>'table' = 'opportunities' then
      for r in select to_jsonb(o) j, o.id from opportunities o join opportunity_dates od on od.opportunity_id = o.id
               where o.owner_id = a.owner_id and o.deleted_at is null and od.kind = 'deadline' and od.day = today + d loop
        insert into automation_runs (automation_id, entity_id, day) values (a.id, r.id, today) on conflict do nothing;
        if found then perform automation_act(a, 'opportunities', r.j); n := n + 1; end if;
      end loop;
    elsif a.trigger->>'table' = 'projects' then
      for r in select to_jsonb(p) j, p.id from projects p where p.owner_id = a.owner_id and p.deleted_at is null and p.target_date = today + d loop
        insert into automation_runs (automation_id, entity_id, day) values (a.id, r.id, today) on conflict do nothing;
        if found then perform automation_act(a, 'projects', r.j); n := n + 1; end if;
      end loop;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.run_date_automations() from public, authenticated;
select cron.unschedule('date-automations') where exists (select 1 from cron.job where jobname = 'date-automations');
select cron.schedule('date-automations', '5 * * * *', 'select public.run_date_automations()');

-- ── 7. Takvim eşitleme: ICS aboneliği (gizli token) ve dış takvimler (salt okunur) ──
create table if not exists calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists external_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Calendar',
  url text not null check (url ~* '^(https?|webcal)://'),
  color text not null default '#5AA9E6',
  last_synced_at timestamptz, error text, event_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists external_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  calendar_id uuid not null references external_calendars on delete cascade,
  uid text not null, title text not null, location text,
  starts_at timestamptz not null, ends_at timestamptz not null, all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists external_events_range on external_events (owner_id, starts_at);
create index if not exists external_events_cal on external_events (calendar_id);
alter table calendar_feeds enable row level security;
alter table external_calendars enable row level security;
alter table external_events enable row level security;
create policy "sahip_erisimi" on calendar_feeds for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "sahip_erisimi" on external_calendars for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "sahip_okur" on external_events for select to authenticated using (owner_id = (select auth.uid()));
create trigger calendar_feeds_log after insert or update or delete on calendar_feeds for each row execute function log_change();
create trigger external_calendars_log after insert or update or delete on external_calendars for each row execute function log_change();
create trigger calendar_feeds_updated before update on calendar_feeds for each row execute function set_updated_at();
create trigger external_calendars_updated before update on external_calendars for each row execute function set_updated_at();
alter publication supabase_realtime add table calendar_feeds, external_calendars, external_events;
select cron.unschedule('calendar-sync') where exists (select 1 from cron.job where jobname = 'calendar-sync');
select cron.schedule('calendar-sync', '17 * * * *', $cron$
  select net.http_post(url := 'https://tjouaydmwmokbuomyyub.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_secrets where key='cron_secret')),
    body := '{"source":"cron"}'::jsonb, timeout_milliseconds := 55000);
$cron$);

-- ── 9. Günlüğe otomatik bilgi: hava durumu ve konum ──
alter table journal_days add column if not exists weather jsonb, add column if not exists place text;

-- ── 10. Ay sonu özeti: ayın son günü 18:00 (İstanbul) bildirim ──
create or replace function public.month_summary_notify() returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/Istanbul')::date; n int;
begin
  if extract(day from d + 1) <> 1 then return 0; end if;
  insert into notifications (owner_id, kind, title, body, url)
  select p.id, 'system', 'Your month in the journal ✦', 'Your ' || to_char(d, 'FMMonth') || ' summary is ready. Tap to see and share it.', '/summary/' || to_char(d, 'YYYY-MM')
  from profiles p
  where not exists (select 1 from notifications x where x.owner_id = p.id and x.url = '/summary/' || to_char(d, 'YYYY-MM'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.month_summary_notify() from public, authenticated;
select cron.unschedule('month-summary') where exists (select 1 from cron.job where jobname = 'month-summary');
select cron.schedule('month-summary', '0 15 28-31 * *', 'select public.month_summary_notify()');

-- ── 14. Çöp kutusu: silinenler kullanıcı silene kadar kalır (otomatik kalıcı silme kapalı) ──
select cron.unschedule('purge-trash') where exists (select 1 from cron.job where jobname = 'purge-trash');
