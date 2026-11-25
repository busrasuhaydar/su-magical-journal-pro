-- 0018 · Kişiselleştirme: listelerde elle sıralama (position), toplu sıra yazma, tanımlara yeni değer ekleme, gömme bloğu.
-- Düzen tercihleri profiles.ui_prefs (jsonb) içinde; şema değişikliği gerekmez.

alter table tasks add column if not exists position double precision;
alter table projects add column if not exists position double precision;
alter table ideas add column if not exists position double precision;
alter table contacts add column if not exists position double precision;
alter table opportunities add column if not exists position double precision;
alter table artworks add column if not exists position double precision;
alter table files add column if not exists position double precision;

-- Sürükle-bırak sonrası sırayı tek seferde yazar (RLS geçerli: yalnız kendi satırların).
create or replace function public.set_positions(p_table text, p_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_table not in ('tasks','projects','ideas','contacts','opportunities','artworks','files') then
    raise exception 'table not allowed';
  end if;
  execute format('update %I t set position = s.ord from unnest($1) with ordinality as s(id, ord) where t.id = s.id and t.owner_id = auth.uid()', p_table)
  using p_ids;
end $$;
grant execute on function public.set_positions(text, uuid[]) to authenticated;

-- Tanımlar: durum/öncelik/aşama listelerine yeni değer (mevcut değerler ve veriler değişmez).
create or replace function public.add_enum_value(p_type text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_type not in ('task_status','priority','project_status','opp_status') then raise exception 'type not allowed'; end if;
  if p_value !~ '^[a-z0-9_]{1,30}$' then raise exception 'invalid value'; end if;
  execute format('alter type public.%I add value if not exists %L', p_type, p_value);
end $$;
revoke all on function public.add_enum_value(text, text) from public;
grant execute on function public.add_enum_value(text, text) to authenticated;

-- Gömme bloğu
alter table page_blocks drop constraint if exists page_blocks_type_check;
alter table page_blocks add constraint page_blocks_type_check check (type in ('text','h1','h2','h3','bullet','numbered','todo','quote','callout','divider','image','file','link','task','page','embed','drawing','button'));
