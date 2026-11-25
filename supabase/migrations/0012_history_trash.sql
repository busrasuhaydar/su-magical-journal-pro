-- 0012 · Sayfa geçmişi ve çöp kutusu.
-- pages / page_blocks zaten log_change tetikleyicisine sahip; yoksa ekle (idempotent).
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'pages_log') then
    create trigger pages_log after insert or update or delete on pages for each row execute function log_change(); end if;
  if not exists (select 1 from pg_trigger where tgname = 'page_blocks_log') then
    create trigger page_blocks_log after insert or update or delete on page_blocks for each row execute function log_change(); end if;
end $$;
create index if not exists change_log_row on change_log (row_id, at desc);
create index if not exists change_log_page_blocks on change_log ((coalesce(after->>'page_id', before->>'page_id'))) where table_name = 'page_blocks';

-- deleted_at + owner_id sütunu olan tablolar (çöp kutusunun kapsamı)
create or replace function trash_tables() returns setof text
language sql stable set search_path = public as $$
  select c.table_name::text from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'deleted_at' and c.table_name <> 'backups'
    and exists (select 1 from information_schema.columns o where o.table_schema = 'public' and o.table_name = c.table_name and o.column_name = 'owner_id')
  order by 1;
$$;

-- Çöp kutusu: silinmiş her kayıt (RLS geçerli)
create or replace function trash_list() returns table (table_name text, id uuid, title text, deleted_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
declare t text;
begin
  for t in select * from trash_tables() loop
    return query execute format(
      'select %L::text, x.id, coalesce(to_jsonb(x)->>''title'', to_jsonb(x)->>''name'', to_jsonb(x)->>''summary'', left(to_jsonb(x)->>''body'', 80), to_jsonb(x)->>''label'', %L)::text, x.deleted_at
         from %I x where x.deleted_at is not null and x.owner_id = (select auth.uid())', t, t, t);
  end loop;
end $$;
grant execute on function trash_list() to authenticated;

