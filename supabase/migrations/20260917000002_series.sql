-- Real series/seasons/episodes — docs/DEVELOPMENT-PLAN.md's 2026-09-17 entry.
-- `videos.series_id` has existed since the original catalogue migration
-- (20260914000003) with nothing to reference — no `series` table was ever created, so
-- the column was dead: never written by publishVideo(), never read by catalogue.ts.
-- `season_number`/`episode_number` were at least read, but never written either.
create table series (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  poster_gradient text[2] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index series_channel_id_idx on series(channel_id);

create trigger series_set_updated_at
  before update on series
  for each row execute function set_updated_at();

-- The FK this column always needed — adding it now, retroactively, is safe: every
-- existing `series_id` value across all seeded/real videos is null (nothing ever wrote
-- to it), so there's nothing that could violate the constraint.
alter table videos add constraint videos_series_id_fkey foreign key (series_id) references series(id) on delete set null;
