-- Follow-up to 20260914000004: that migration closed the languages/links/
-- verification_status/joined_at gap on organizations but missed followers/total_views,
-- which the mock Channel type also has real values for. Same seeded-snapshot caveat
-- applies — not live-computed, backfilled from the same mock dataset.
alter table organizations
  add column followers bigint not null default 0,
  add column total_views bigint not null default 0;
