-- 0014 · Gezinme: sayfa kapak görseli (galeriden). Favoriler ve son açılanlar profiles.ui_prefs içinde (şema değişikliği yok).
alter table pages add column if not exists cover_file_id uuid references files on delete set null;
