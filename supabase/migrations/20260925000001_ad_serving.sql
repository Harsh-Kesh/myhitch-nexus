-- Real in-house ad-serving (P6/TPI-6) — first real slice. Everything ad-related has been
-- 100% mock since this project began: no real campaigns table, no real creative asset (the
-- mock CampaignCreative only carries a two-colour gradient), no click-through URL anywhere,
-- and a hardcoded "ch_helio" advertiser literal in the creation wizard instead of a real
-- signed-in advertiser. This migration is the real schema underneath that system.
--
-- `campaigns` normalizes targeting as array columns on the row itself rather than a
-- separate campaign_targeting table — the same shape video_rights.permitted_countries/
-- blocked_countries already uses for the identical "fixed set of array fields" case. A
-- child table earns its keep for a genuine one-to-many list, which targeting isn't;
-- creatives are, so campaign_creatives stays a real child table (mirrors video_credits/
-- video_subtitle_tracks's existing per-parent child-list pattern).
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  objective text not null check (objective in ('awareness', 'consideration', 'conversion', 'traffic')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'active', 'paused', 'completed', 'rejected')),
  budget_minor integer not null check (budget_minor > 0),
  daily_cap_minor integer not null check (daily_cap_minor > 0),
  -- Real, sent flat CPM — the mock wizard's own "bidStrategy" field was collected in the
  -- UI but never even included in the create-campaign payload (confirmed dead state); a
  -- real per-impression cost needs a real rate, so this replaces it rather than reusing it.
  cpm_minor integer not null check (cpm_minor > 0),
  currency text not null default 'GBP',
  spend_minor integer not null default 0,
  start_date date not null,
  end_date date not null,
  target_countries text[] not null default '{}',
  target_languages text[] not null default '{}',
  target_age_bands text[] not null default '{}',
  target_interests text[] not null default '{}',
  target_category_ids uuid[] not null default '{}',
  target_devices text[] not null default '{}',
  placements text[] not null default '{}',
  frequency_cap_impressions integer not null default 3,
  frequency_cap_hours integer not null default 24,
  excluded_content_labels text[] not null default '{}',
  min_age_rating text not null default 'U' check (min_age_rating in ('U', 'PG', '12', '15', '18')),
  block_user_generated boolean not null default false,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references accounts(id) on delete set null,
  decision_reason text
);

create index campaigns_advertiser_org_id_idx on campaigns(advertiser_org_id);
create index campaigns_status_idx on campaigns(status);

create table campaign_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  format text not null check (format in ('pre-roll', 'mid-roll', 'post-roll', 'overlay', 'sponsored-card')),
  duration_seconds integer not null default 0,
  -- Nullable until the real upload completes (same two-step "create row, then attach
  -- asset" shape videos.master_asset_path already uses) — the real uploaded ad video,
  -- replacing the mock's gradient-only "creative."
  asset_path text,
  click_through_url text,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);

create index campaign_creatives_campaign_id_idx on campaign_creatives(campaign_id);

-- Append-only, audit_log's established shape for an event table (surrogate uuid PK, no
-- upsert, indexed on created_at plus whatever queries will filter by). Doubles as the real
-- ad-revenue ledger row, the same way entitlements already doubles as both "proof of
-- purchase" and "revenue ledger source" for commissions.ts — cost_minor is charged against
-- the campaign's budget, platform_fee_minor/creator_net_minor is the commission split
-- (new 'ad_revenue' commission_rates scope below), channel_id is who gets paid.
create table ad_impressions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creative_id uuid not null references campaign_creatives(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  channel_id uuid not null references organizations(id) on delete cascade,
  -- Nullable: frequency capping (Redis-keyed by account) is signed-in-viewers-only in this
  -- slice, but an impression itself can still come from a guest — never blocking real ad
  -- delivery just because the viewer isn't signed in.
  viewer_account_id uuid references accounts(id) on delete set null,
  placement text not null,
  cost_minor integer not null,
  platform_fee_minor integer not null,
  creator_net_minor integer not null,
  currency text not null,
  created_at timestamptz not null default now()
);

create index ad_impressions_created_at_idx on ad_impressions(created_at);
create index ad_impressions_campaign_id_idx on ad_impressions(campaign_id);
create index ad_impressions_channel_id_idx on ad_impressions(channel_id);

create table ad_clicks (
  id uuid primary key default gen_random_uuid(),
  impression_id uuid not null references ad_impressions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ad_clicks_impression_id_idx on ad_clicks(impression_id);

-- Same rate-window machinery every other scope already uses (listCommissionRates()/
-- pickEffectiveRate() are scope-agnostic) — no new rate-selection logic, just a 4th value.
alter table commission_rates drop constraint commission_rates_scope_check;
alter table commission_rates add constraint commission_rates_scope_check
  check (scope in ('purchase_rental', 'ppv', 'membership', 'ad_revenue'));
insert into commission_rates (scope, platform_share_pct, effective_from)
  values ('ad_revenue', 30, now() - interval '1 day');

alter table campaigns enable row level security;
alter table campaign_creatives enable row level security;
alter table ad_impressions enable row level security;
alter table ad_clicks enable row level security;
