-- 0016 · Başvuru kiti: biyografi, CV, sanatçı beyanı; TR/EN; kısa/uzun. Fırsatlardaki istenen belgelere bağlanır (required_docs[].kit_id).
create table if not exists application_kit (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('bio','cv','statement')),
  lang text not null check (lang in ('tr','en')),
  length text not null check (length in ('short','long')),
  title text,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists application_kit_slot on application_kit (owner_id, kind, lang, length) where deleted_at is null;
alter table application_kit enable row level security;
create policy "sahip_erisimi" on application_kit for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger application_kit_log after insert or update or delete on application_kit for each row execute function log_change();
create trigger application_kit_updated before update on application_kit for each row execute function set_updated_at();
alter publication supabase_realtime add table application_kit;
