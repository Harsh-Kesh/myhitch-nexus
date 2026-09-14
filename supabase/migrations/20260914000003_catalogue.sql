-- Catalogue schema for SRS §6.1 (Discovery) and §6.4 (Playback) — the part of Phase 1
-- that needs no identity/session work at all (anonymous browsing, FR-6.1) and so isn't
-- blocked on the Auth0 integration. Field shapes are taken directly from the existing
-- prototype's src/lib/mock-api/types.ts (Video, VideoPricing, VideoRights, Category,
-- Comment, Rating, WatchProgress) and from docs/openapi.yaml, not re-derived from the
-- SRS prose, so there is no translation layer once real routes replace the mock.
--
-- Deliberately excluded: `posterGradient`/`authorGradient` fields ([string,string]
-- colour pairs) that exist only so the prototype can render placeholder art in place
-- of a real thumbnail/avatar — a demo rendering artifact, not a real content
-- attribute, so there is nothing to persist. Real thumbnails use thumbnail_url/
-- avatar_url as already modelled on videos/organizations.
--
-- Deliberately included despite being P3/P4 concerns on paper: video_rights and
-- video_pricing. AC-3 (nothing publishes without rights/classification complete)
-- and FR-6.4.6 (geo-restriction/age-rating checks) apply to free content too, so
-- these need to exist from the first video onward, not bolted on when payments
-- arrive — only the actual payment/entitlement *processing* is deferred to P3.

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  content_type text not null check (content_type in (
    'commercial', 'film', 'entertainment', 'education', 'news', 'documentary',
    'live', 'tourism', 'government', 'nonprofit', 'user-generated'
  )),
  featured boolean not null default false,
  accent_token smallint not null default 1 check (accent_token between 1 and 6),
  image_url text,
  created_at timestamptz not null default now()
);

create index categories_content_type_idx on categories(content_type);

-- ── videos (content record) ─────────────────────────────────────────────
create table videos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  channel_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  synopsis text,
  content_type text not null check (content_type in (
    'commercial', 'film', 'entertainment', 'education', 'news', 'documentary',
    'live', 'tourism', 'government', 'nonprofit', 'user-generated'
  )),
  status text not null default 'draft' check (status in (
    'draft', 'pending', 'published', 'scheduled', 'private', 'unlisted',
    'restricted', 'rejected', 'archived'
  )),
  thumbnail_url text,
  hero_url text,
  duration_seconds integer not null default 0,
  release_date date,
  published_at timestamptz,
  scheduled_for timestamptz,
  language text,
  language_code text,
  country text,
  production_company text,
  has_audio_description boolean not null default false,
  trailer_available boolean not null default false,
  sample_src text,
  watermark_enabled boolean not null default false,
  series_id uuid,
  season_number integer,
  episode_number integer,
  -- Denormalised counters (views/likes/ratings/comment_count/watch_time/completion)
  -- are updated by the analytics/engagement services, not written directly by
  -- clients — deliberately omitted from this table; they belong with the
  -- analytics event pipeline (SRS §6.9), not the editorial content record, so
  -- they can be recomputed/backfilled without touching this table's identity.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index videos_channel_id_idx on videos(channel_id);
create index videos_content_type_idx on videos(content_type);
create index videos_published_idx on videos(published_at) where status = 'published';

create trigger videos_set_updated_at
  before update on videos
  for each row execute function set_updated_at();

-- ── taxonomy / tags (many-to-many) ──────────────────────────────────────
create table video_categories (
  video_id uuid not null references videos(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (video_id, category_id)
);

create table video_tags (
  video_id uuid not null references videos(id) on delete cascade,
  tag text not null,
  primary key (video_id, tag)
);

-- ── credits (cast/crew) ──────────────────────────────────────────────────
create table video_credits (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  role text not null,
  name text not null,
  character_name text,
  ordering integer not null default 0
);

create index video_credits_video_id_idx on video_credits(video_id);

-- ── accessibility / technical tracks ─────────────────────────────────────
create table video_subtitle_tracks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  language text not null,
  language_code text not null,
  kind text not null check (kind in ('subtitles', 'captions', 'sdh', 'descriptions')),
  auto_generated boolean not null default false,
  status text not null default 'generating' check (status in ('ready', 'generating', 'failed'))
);

create table video_audio_tracks (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  language text not null,
  language_code text not null,
  kind text not null check (kind in ('original', 'dubbed', 'audio-description', 'commentary'))
);

create table video_quality_levels (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  label text not null,
  height integer not null,
  bitrate_kbps integer not null
);

create index video_subtitle_tracks_video_id_idx on video_subtitle_tracks(video_id);
create index video_audio_tracks_video_id_idx on video_audio_tracks(video_id);
create index video_quality_levels_video_id_idx on video_quality_levels(video_id);

-- ── rights (1:1) — required before publish regardless of monetisation ────
create table video_rights (
  video_id uuid primary key references videos(id) on delete cascade,
  declared_owner text not null,
  ownership_confirmed boolean not null default false,
  licence_start date,
  licence_end date,
  -- ISO-3166 alpha-2. Empty array means worldwide (matches types.ts's convention).
  permitted_countries text[] not null default '{}',
  blocked_countries text[] not null default '{}',
  age_rating text not null default 'U' check (age_rating in ('U', 'PG', '12', '15', '18')),
  content_labels text[] not null default '{}'
);

-- ── pricing (1:1) — access-model config; real payment processing is Phase 3 ──
create table video_pricing (
  video_id uuid primary key references videos(id) on delete cascade,
  access_models text[] not null default '{free}',
  rent_price_minor integer,
  rent_price_currency text check (rent_price_currency in ('GBP', 'USD', 'EUR', 'LKR')),
  buy_price_minor integer,
  buy_price_currency text check (buy_price_currency in ('GBP', 'USD', 'EUR', 'LKR')),
  ppv_price_minor integer,
  ppv_price_currency text check (ppv_price_currency in ('GBP', 'USD', 'EUR', 'LKR')),
  rental_window_hours integer,
  membership_tier text,
  sponsored boolean not null default false,
  sponsor_name text,
  constraint video_pricing_access_models_valid check (
    access_models <@ array['free', 'ad-supported', 'rent', 'buy', 'subscription', 'ppv', 'membership']
  )
);

-- ── engagement: comments, ratings, watchlist, watch history, follows ─────
create table video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  parent_comment_id uuid references video_comments(id) on delete cascade,
  body text not null,
  status text not null default 'published' check (status in ('published', 'held', 'removed')),
  held_reason text,
  likes integer not null default 0,
  pinned boolean not null default false,
  hearted_by_creator boolean not null default false,
  created_at timestamptz not null default now()
);

create index video_comments_video_id_idx on video_comments(video_id);
create index video_comments_parent_id_idx on video_comments(parent_comment_id);

create table video_ratings (
  video_id uuid not null references videos(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (video_id, account_id)
);

create table watchlist_items (
  account_id uuid not null references accounts(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, video_id)
);

create table watch_progress (
  account_id uuid not null references accounts(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  position_seconds integer not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (account_id, video_id)
);

create table channel_follows (
  account_id uuid not null references accounts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, organization_id)
);

-- ── RLS: same posture as every other table — locked to service-role only ─
alter table categories enable row level security;
alter table videos enable row level security;
alter table video_categories enable row level security;
alter table video_tags enable row level security;
alter table video_credits enable row level security;
alter table video_subtitle_tracks enable row level security;
alter table video_audio_tracks enable row level security;
alter table video_quality_levels enable row level security;
alter table video_rights enable row level security;
alter table video_pricing enable row level security;
alter table video_comments enable row level security;
alter table video_ratings enable row level security;
alter table watchlist_items enable row level security;
alter table watch_progress enable row level security;
alter table channel_follows enable row level security;
