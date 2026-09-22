-- Completed-view tracking for ads (FR-6.8.5).
-- Tracks when an ad impression finishes playing to completion.
alter table ad_impressions add column if not exists completed_at timestamptz;
create index if not exists ad_impressions_completed_at_idx on ad_impressions(completed_at);
