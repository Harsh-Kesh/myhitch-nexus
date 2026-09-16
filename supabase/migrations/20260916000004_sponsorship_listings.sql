-- The "Exchange Hub" sponsorship marketplace — docs/DEVELOPMENT-PLAN.md's Exchange Hub
-- research, 2026-09-16. A creator publishes a pitch (and, optionally, a trailer) asking
-- for sponsorship; a business/advertiser account can express interest.
--
-- The research's single biggest finding governs this schema: under Australian law, an
-- ask that offers a share of profits/revenue in exchange for money is not a sponsorship
-- any more, it's an unregistered investment offer (a managed investment scheme under the
-- Corporations Act — penalties up to two years' imprisonment). The fix isn't a content
-- policy enforced by a moderator's judgement call after the fact; it's making that
-- wording *structurally impossible to enter*. There is deliberately no free-text "what
-- the sponsor gets in return" field anywhere in this schema — only a closed set of
-- non-financial rewards (sponsorship_rewards, its own check-constrained table), matching
-- the boss's brief exactly ("asking for sponsorships on their product") without opening
-- the profit-share/investment door at all. Money never moves through the platform in v1
-- either, per the same research — that alone avoids the crowdfunding-intermediary
-- licensing question entirely.
create table sponsorship_listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  channel_id uuid not null references organizations(id) on delete cascade,
  created_by_account_id uuid not null references accounts(id) on delete cascade,
  -- Optional, same reasoning as magazine_articles.video_id: real video publishing is
  -- still mock, so requiring a real videos row would make this unusable today.
  video_id uuid references videos(id) on delete set null,
  project_name text not null,
  pitch_html text not null default '',
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'changes_requested', 'published', 'rejected', 'withdrawn', 'closed'
  )),
  reviewer_notes text,
  reviewed_by uuid references accounts(id),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sponsorship_listings_channel_idx on sponsorship_listings(channel_id);
create index sponsorship_listings_status_idx on sponsorship_listings(status);

create trigger sponsorship_listings_set_updated_at
  before update on sponsorship_listings
  for each row execute function set_updated_at();

-- The closed reward vocabulary itself — see this file's header. Every value here is a
-- non-financial exposure/credit reward; there is no row shape that can express "a
-- percentage of profits" or "an ownership stake".
create table sponsorship_rewards (
  listing_id uuid not null references sponsorship_listings(id) on delete cascade,
  reward_type text not null check (reward_type in (
    'screen_credit', 'logo_placement', 'product_placement',
    'premiere_tickets', 'social_mention', 'official_sponsor_badge'
  )),
  primary key (listing_id, reward_type)
);

-- On-platform contact, not exposed email — the research's recommendation for
-- defensibility and an audit trail. A lightweight inquiry, not a full message thread
-- (no messaging primitive exists yet elsewhere in the app either) — closer in shape to
-- the existing business "Leads" concept than to a chat feature.
create table sponsorship_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references sponsorship_listings(id) on delete cascade,
  sponsor_account_id uuid not null references accounts(id) on delete cascade,
  message text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index sponsorship_inquiries_listing_idx on sponsorship_inquiries(listing_id);

alter table sponsorship_listings enable row level security;
alter table sponsorship_rewards enable row level security;
alter table sponsorship_inquiries enable row level security;
