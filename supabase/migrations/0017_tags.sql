-- 0017 · Ortak etiketler: görev, sayfa, eser, kişi, fırsat ve fikir etiketlenebilir.
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  color text not null default '#E2558C',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists tags_owner_name on tags (owner_id, lower(name)) where deleted_at is null;
create table if not exists tag_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  tag_id uuid not null references tags on delete cascade,
  entity_type text not null check (entity_type in ('task','page','artwork','contact','opportunity','idea')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tag_id, entity_type, entity_id)
);
create index if not exists tag_links_entity on tag_links (owner_id, entity_type, entity_id);
alter table tags enable row level security;
alter table tag_links enable row level security;
create policy "sahip_erisimi" on tags for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "sahip_erisimi" on tag_links for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger tags_log after insert or update or delete on tags for each row execute function log_change();
create trigger tag_links_log after insert or update or delete on tag_links for each row execute function log_change();
create trigger tags_updated before update on tags for each row execute function set_updated_at();
create trigger tag_links_updated before update on tag_links for each row execute function set_updated_at();
alter publication supabase_realtime add table tags, tag_links;
