-- 0011 · Tam metin arama: Türkçe (+ basit) tsvector sütunları, GIN index ve search_content RPC'si.
alter table page_blocks add column if not exists fts tsvector generated always as (
  to_tsvector('turkish', coalesce(content->>'text','') || ' ' || coalesce(content->>'title','') || ' ' || coalesce(content->>'caption',''))
  || to_tsvector('simple', coalesce(content->>'text','') || ' ' || coalesce(content->>'title',''))) stored;
alter table journal_blocks add column if not exists fts tsvector generated always as (
  to_tsvector('turkish', coalesce(title,'') || ' ' || coalesce(body,'')) || to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) stored;
alter table notes add column if not exists fts tsvector generated always as (
  to_tsvector('turkish', coalesce(title,'') || ' ' || coalesce(body,'')) || to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) stored;
alter table ideas add column if not exists fts tsvector generated always as (
  to_tsvector('turkish', coalesce(title,'') || ' ' || coalesce(body,'')) || to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) stored;
create index if not exists page_blocks_fts on page_blocks using gin (fts);
create index if not exists journal_blocks_fts on journal_blocks using gin (fts);
create index if not exists notes_fts on notes using gin (fts);
create index if not exists ideas_fts on ideas using gin (fts);

-- Kullanıcının yazdığı metinden önek eşleşmeli sorgu: "kristal sergi" → kristal:* & sergi:*
create or replace function search_query(cfg regconfig, q text) returns tsquery
language sql immutable set search_path = public, pg_catalog as $$
  select case when coalesce(string_agg(w, ' & '), '') = '' then null else to_tsquery(cfg, string_agg(w, ' & ')) end
  from (select quote_literal(m[1]) || ':*' as w from regexp_matches(lower(q), '([[:alnum:]çğıöşüâîû]+)', 'g') as m) s;
$$;

-- RLS geçerli (security invoker): yalnız kullanıcının kendi kayıtları döner.
create or replace function search_content(q text, max_rows int default 30)
returns table (kind text, id uuid, parent_id uuid, title text, snippet text, rank real, updated_at timestamptz)
language sql stable security invoker set search_path = public, pg_catalog as $$
  with tq as (select search_query('turkish', q) || search_query('simple', q) as t)
  select * from (
    select 'page'::text, b.page_id, p.project_id, p.title,
      ts_headline('turkish', coalesce(b.content->>'text', b.content->>'title', ''), tq.t, 'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=1'),
      ts_rank(b.fts, tq.t), b.updated_at
    from page_blocks b join pages p on p.id = b.page_id, tq
    where tq.t is not null and b.fts @@ tq.t and p.deleted_at is null
    union all
    select 'journal', j.id, j.day_id, to_char(d.day, 'YYYY-MM-DD'),
      ts_headline('turkish', coalesce(j.body, j.title, ''), tq.t, 'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=1'),
      ts_rank(j.fts, tq.t), j.updated_at
    from journal_blocks j join journal_days d on d.id = j.day_id, tq
    where tq.t is not null and j.fts @@ tq.t and j.deleted_at is null
    union all
    select 'note', n.id, n.project_id, n.title,
      ts_headline('turkish', coalesce(n.body, n.title), tq.t, 'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=1'),
      ts_rank(n.fts, tq.t), n.updated_at
    from notes n, tq where tq.t is not null and n.fts @@ tq.t and n.deleted_at is null
    union all
    select 'idea', i.id, i.project_id, i.title,
      ts_headline('turkish', coalesce(i.body, i.title), tq.t, 'StartSel=«,StopSel=»,MaxWords=18,MinWords=6,MaxFragments=1'),
      ts_rank(i.fts, tq.t), i.updated_at
    from ideas i, tq where tq.t is not null and i.fts @@ tq.t and i.deleted_at is null
  ) r order by 6 desc, 7 desc limit max_rows;
$$;
grant execute on function search_content(text, int) to authenticated;
grant execute on function search_query(regconfig, text) to authenticated;
