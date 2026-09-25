-- Profile-scoped watch history (Family Tier) — watch_progress was purely account_id-
-- scoped, so a kids profile shared the exact same continue-watching rail and resume
-- position as every adult profile on the same account (found during the 2026-09-24
-- platform audit). profile_id is nullable rather than a backfilled default profile per
-- account — most accounts (anyone not on Family tier) never create a profile at all, and
-- forcing one into existence here would misrepresent that. A null profile_id keeps its
-- existing, unchanged meaning: "this account's progress, no specific profile selected."
alter table watch_progress add column if not exists profile_id uuid references account_profiles(id) on delete cascade;

-- The old (account_id, video_id) primary key can't simply gain a nullable column (a NULL
-- profile_id previously matched any other NULL for uniqueness purposes under a plain
-- column-list constraint) — this expression index makes NULL behave as its own single
-- value ('00000000-...') for conflict purposes, so `on conflict` in saveWatchProgress()
-- still has exactly one row to target per (account, video, profile-or-none).
alter table watch_progress drop constraint if exists watch_progress_pkey;
create unique index if not exists watch_progress_account_video_profile_idx
  on watch_progress (account_id, video_id, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));
