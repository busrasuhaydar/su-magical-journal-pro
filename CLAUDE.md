# Su's Magical Journal · Crystal Journal Pro (English)

English-only copy of the Turkish crystal journal (`~/Desktop/Su Kristal Defter`). Same stack (React 18 + TypeScript + Vite, TanStack Query, Supabase project `tjouaydmwmokbuomyyub`), same crystal/WebGL theme in `src/crystal/`. Dev port **5176** (`magical-pro`). Repo: github.com/busrasuhaydar/su-magical-journal-pro (GitHub Pages base `/su-magical-journal-pro/`).

## Differences from the original
- All UI text is English; dates use English month/weekday names; locale `en-US`/`en-GB`; time zone is still Europe/Istanbul.
- Routes are English: `/calendar/{year,month,week,agenda}`, `/day/:date`, `/tasks`, `/projects/:slug/{overview,tasks,gallery,pages,notes,timeline,social,opportunities,contacts}`, `/opportunities/:id`, `/contacts`, `/ideas`, `/collections/:slug`, `/gallery`, `/files`, `/settings`, `/social`.
- `public/collections.json` (was `koleksiyonlar.json`); collection projects still use the DB slug prefix `koleksiyon-<slug>` (existing data).
- `supabase/functions/*` are translated but not deployed; deployed functions (notification texts, AI extraction language) are still the original Turkish ones until deployed.
- Existing DB rows keep their Turkish values (task categories, project titles, etc.).

## Rules carried over
- Single-record principle, soft delete (`deleted_at`), RLS with `owner_id`, `memory_entries` append-only.
- Every button has an icon (lucide-react); no overlapping/fixed-position items; check 375px and desktop.
- New CSS goes at the END of `src/styles/crystal.css`; add new pages to `NAV` in `src/crystal/Nav.tsx`.
- Check = `npx tsc -p tsconfig.json`. Reply to the user briefly.

## Pro features (migrations 0009–0017)
- Backups: `backups` table + private `backups` bucket, edge function `backup` (deployed; cron `weekly-backup` Sun 03:00 UTC). Google Drive needs secrets `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` (redirect URI: `<SUPABASE_URL>/functions/v1/backup?drive_callback=1`).
- Shared block editor `src/components/editor/` (BlockEditor, PageView, PageTree, History, Backlinks). Journal = `pages.journal_day`; free pages = `pages.project_id is null`. `[[page:id|Title]]` tokens → `entity_links` (from_type `page_mention`).
- Full-text search RPC `search_content(q)`; trash RPC `trash_list()`; `0012_history_trash_purge.sql` (30-day purge cron) must be run manually in the SQL editor.
- Offline: `src/lib/offline.ts` (IndexedDB query cache + write queue via custom supabase fetch).
- New tables: inbox_items, artworks, application_kit, tags, tag_links (all: owner_id, RLS sahip_erisimi, log_change, deleted_at, realtime, TABLE_KEYS). Print pages live outside the Shell under `/print/*`.
