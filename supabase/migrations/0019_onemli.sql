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
