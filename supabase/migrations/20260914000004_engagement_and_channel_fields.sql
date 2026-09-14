-- Closes two parity gaps recorded in docs/DEVELOPMENT-PLAN.md's P1 entry that were
-- deliberately left as reasons NOT to swap getVideo()/getChannel()/getChannels() to real
-- data yet: engagement counters on videos, and a few Channel fields.
--
-- These columns are seeded from the same prototype mock data every other seeded row came
-- from (scripts/backfill-engagement-fields.mjs) — not invented, not zeroed. They are a
-- snapshot, not a live computation: nothing here is wired to update as real usage happens
-- yet (that's the actual SRS §6.9 analytics-pipeline work, still to build). Treat these as
-- seed/demo values a real pipeline will eventually supersede, the same way the rest of the
-- seeded catalogue is demo content standing in for what real publishing will produce.
alter table videos
  add column views bigint not null default 0,
  add column unique_viewers bigint not null default 0,
  add column likes bigint not null default 0,
  add column rating_average numeric(2, 1) not null default 0,
  add column rating_count integer not null default 0,
  add column comment_count integer not null default 0,
  add column watch_time_seconds bigint not null default 0,
  add column completion_rate numeric(5, 2) not null default 0;

alter table organizations
  add column languages text[] not null default '{}',
  add column links jsonb not null default '[]',
  add column verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column joined_at timestamptz;

-- Backfill joined_at from created_at for the rows already seeded — new rows going forward
-- get it explicitly at creation time instead of defaulting to "now" implicitly.
update organizations set joined_at = created_at where joined_at is null;
alter table organizations alter column joined_at set not null;
