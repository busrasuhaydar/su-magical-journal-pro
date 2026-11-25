-- 0015 · Eser envanteri: görsel, künye, fiyat + para birimi, fiyat geçmişi, durum, konum, alıcı, proje ve NFT bağı.
create table if not exists artworks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  year integer check (year between 1900 and 2200),
  technique text,
  dimensions text,
  edition text,
  price numeric(14,2) check (price >= 0),
  currency text not null default 'USD',
  price_history jsonb not null default '[]'::jsonb,
  status text not null default 'studio' check (status in ('studio','consignment','exhibition','sold')),
  location text,
  buyer_contact_id uuid references contacts on delete set null,
  project_id uuid references projects on delete set null,
  file_id uuid references files on delete set null,
  nft_key text,
  nft_image text,
  description text,
  notes text,
  sold_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists artworks_owner on artworks (owner_id, created_at desc) where deleted_at is null;
create unique index if not exists artworks_owner_nft on artworks (owner_id, nft_key) where nft_key is not null and deleted_at is null;
alter table artworks enable row level security;
create policy "sahip_erisimi" on artworks for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger artworks_log after insert or update or delete on artworks for each row execute function log_change();
create trigger artworks_updated before update on artworks for each row execute function set_updated_at();
alter publication supabase_realtime add table artworks;

-- Fiyat değişince geçmişe yaz (sunucuda: hiçbir istemci unutamaz)
create or replace function artworks_price_history() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.price is not null and (tg_op = 'INSERT' or new.price is distinct from old.price or new.currency is distinct from old.currency) then
    new.price_history := coalesce(case when tg_op = 'INSERT' then new.price_history else old.price_history end, '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('at', now(), 'price', new.price, 'currency', new.currency));
  end if;
  if new.status = 'sold' and (tg_op = 'INSERT' or old.status is distinct from 'sold') and new.sold_at is null then new.sold_at := current_date; end if;
  return new;
end $$;
create trigger artworks_price before insert or update on artworks for each row execute function artworks_price_history();
