-- 0012b · 30 günden eski silinmiş kayıtları her gece kalıcı siler.
-- NOT: Supabase MCP bu kalıcı-silme göçünü kullanıcı onayı olmadan uygulamadı. Supabase SQL Editor'de bir kez çalıştırın.
-- 30 günden eski silinmişleri kalıcı sil (pg_cron, her gece)
create or replace function purge_trash() returns integer
language plpgsql security definer set search_path = public as $$
declare t text; n integer := 0; c integer;
begin
  for t in select * from trash_tables() loop
    begin
      execute format('delete from %I where deleted_at < now() - interval ''30 days''', t);
      get diagnostics c = row_count; n := n + c;
    exception when others then raise notice 'purge % skipped: %', t, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke all on function purge_trash() from public, anon, authenticated;
select cron.schedule('purge-trash', '30 3 * * *', 'select public.purge_trash()');
