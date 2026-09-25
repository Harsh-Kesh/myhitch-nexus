-- Real personal (viewer-owned) playlists — distinct from a creator's channel playlists
-- (studio/playlists, still 100% mock, a separate "organize my own uploads into a series"
-- concept). The Free-tier pricing page promises "Create playlists & watchlists" as two
-- separate things, but only Watchlist existed as a real, findable feature for a viewer —
-- reported live, 2026-09-25, as "how can I create a playlist, can't find it," because it
-- genuinely didn't exist anywhere for a viewer to reach.
create table if not exists viewer_playlists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  description text,
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists viewer_playlists_account_idx on viewer_playlists(account_id, updated_at desc);

create table if not exists viewer_playlist_items (
  playlist_id uuid not null references viewer_playlists(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (playlist_id, video_id)
);

create index if not exists viewer_playlist_items_playlist_idx on viewer_playlist_items(playlist_id, added_at desc);
