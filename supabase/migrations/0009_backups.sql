-- 0009 · Otomatik yedekleme: yedek kayıtları, özel Storage kovası, haftalık pg_cron.
create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  storage_path text not null,
  size_bytes bigint not null default 0,
  row_count integer not null default 0,
  tables jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('manual','cron')),
  drive_status text not null default 'not_configured',
  drive_file_id text,
  restored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists backups_owner_created on backups (owner_id, created_at desc);
alter table backups enable row level security;
create policy "sahip_erisimi" on backups for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger backups_log after insert or update or delete on backups for each row execute function log_change();
alter publication supabase_realtime add table backups;

-- Yedeklenecek tablolar: owner_id sütunu olan tüm public tablolar (gizli/teknik tablolar hariç).
create or replace function backup_tables() returns setof text
language sql stable security definer set search_path = public as $$
  select c.table_name::text from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'owner_id'
    and c.table_name not in ('change_log','backups','social_tokens','oauth_states','push_subscriptions','app_secrets')
  order by 1;
$$;
revoke all on function backup_tables() from public, anon, authenticated;
grant execute on function backup_tables() to service_role;

-- Özel kova (yalnız sahibi okur; yazma edge function ile service role)
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;
create policy "yedek_sahibi_okur" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Haftalık: Pazar 03:00 (UTC) tüm kullanıcılar için yedek
select cron.schedule('weekly-backup', '0 3 * * 0', $cron$
  select net.http_post(url := 'https://tjouaydmwmokbuomyyub.supabase.co/functions/v1/backup',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_secrets where key='cron_secret')),
    body := '{"action":"cron"}'::jsonb, timeout_milliseconds := 120000);
$cron$);
