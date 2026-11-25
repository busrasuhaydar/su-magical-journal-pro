-- 0010 · Akıllı editör: günlük sayfası da aynı blok editörünü kullanır (pages.journal_day).
-- Proje dışı sayfalar için project_id artık boş olabilir.
alter table pages alter column project_id drop not null;
alter table pages add column if not exists journal_day date;
alter table pages add constraint pages_owner_journal_day unique (owner_id, journal_day);
create index if not exists pages_owner_project on pages (owner_id, project_id) where deleted_at is null;
