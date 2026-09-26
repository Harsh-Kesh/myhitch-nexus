-- Profile-scoped personal playlists (Family Tier) — viewer_playlists was purely
-- account_id-scoped, so every household profile shared the exact same "My Playlists"
-- list, with no way to keep one profile's saves private from the others (reported live,
-- 2026-09-26, alongside the same gap already fixed for watch_progress in
-- 20260930000003_watch_progress_profiles.sql). profile_id is nullable, not backfilled to
-- a default profile — a null profile_id means "visible to every profile on this
-- account" (an account-wide playlist), which is what every existing playlist already
-- means and must keep meaning; most accounts never create a profile at all.
alter table viewer_playlists add column if not exists profile_id uuid references account_profiles(id) on delete cascade;

create index if not exists viewer_playlists_profile_idx on viewer_playlists(profile_id);
