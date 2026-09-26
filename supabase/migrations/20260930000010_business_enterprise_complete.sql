-- Real backend for the remaining Business/Enterprise Plan features (leads, product
-- links, video versions, SSO config, priority support, and timecoded client-review
-- comments) — everything here was still mock: getLeads()/getProductLinks() had no real
-- branch at all (a real business account's leads/product-links pages always showed the
-- shared demo persona's seeded mock data, keyed off a hardcoded "ch_helio" channel id
-- that no real organization ever has), and video versioning / SSO / priority support
-- didn't exist in any form. client_reviews, enterprise_transfers and audit_log already
-- exist and stay as-is — review_comments extends the existing review workflow with a
-- real timecoded feedback timeline instead of the single `client_reviews.feedback` text
-- field it shipped with.

create table if not exists business_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source_video_id uuid references videos(id) on delete set null,
  name text not null,
  email text not null,
  company text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists business_leads_org_idx on business_leads(organization_id, created_at desc);
create index if not exists business_leads_status_idx on business_leads(organization_id, status);

create table if not exists product_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_name text not null,
  mart_product_id text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'AUD',
  commission_rate numeric not null default 0,
  target_url text,
  clicks_count integer not null default 0,
  conversions_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_links_org_idx on product_links(organization_id, created_at desc);

create table if not exists video_product_links (
  video_id uuid not null references videos(id) on delete cascade,
  product_link_id uuid not null references product_links(id) on delete cascade,
  timestamp_seconds integer not null default 0,
  primary key (video_id, product_link_id)
);
create index if not exists video_product_links_link_idx on video_product_links(product_link_id);

create table if not exists video_versions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  version_number integer not null,
  title text not null,
  asset_url text not null,
  changes_notes text,
  created_by uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (video_id, version_number)
);
create index if not exists video_versions_video_idx on video_versions(video_id, version_number desc);

create table if not exists enterprise_sso_configs (
  organization_id uuid primary key references organizations(id) on delete cascade,
  idp_metadata_url text,
  sso_domain text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  subject text not null,
  message text not null,
  priority text not null default 'high' check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_org_idx on support_tickets(organization_id, created_at desc);

-- video_id on client_reviews is `text`, not a real FK (it can hold a review-only title
-- with no linked video row) — review_comments only ever needs the review itself, so it
-- FKs to client_reviews(id), same as every other review-scoped concept would.
create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references client_reviews(id) on delete cascade,
  author_name text not null,
  timestamp_seconds integer not null default 0,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists review_comments_review_idx on review_comments(review_id, timestamp_seconds);
