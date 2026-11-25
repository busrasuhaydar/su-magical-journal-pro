-- 0013 · Hızlı yakalama: paylaşılan içerik (share_target) ve ana sayfa hızlı notları "Gelen kutusu"na düşer.
create table if not exists inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'text' check (kind in ('text','link','image','file')),
  text text,
  url text,
  file_id uuid references files on delete set null,
  source text not null default 'quick' check (source in ('quick','share')),
  processed_at timestamptz,
  moved_to jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists inbox_owner_open on inbox_items (owner_id, created_at desc) where processed_at is null and deleted_at is null;
alter table inbox_items enable row level security;
create policy "sahip_erisimi" on inbox_items for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger inbox_items_log after insert or update or delete on inbox_items for each row execute function log_change();
create trigger inbox_items_updated before update on inbox_items for each row execute function set_updated_at();
alter publication supabase_realtime add table inbox_items;
