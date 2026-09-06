-- Phase 0 foundation: accounts, household profiles, organizations/channels,
-- org memberships, and platform-wide role grants.
--
-- Identity/login is handled by Auth0 (not yet wired), so `accounts` is keyed
-- by an external `auth0_sub` rather than Supabase's own `auth.users` — this
-- table holds application data (roles, orgs, profiles), not credentials.
--
-- RLS is enabled on every table but left service-role-only for now: nothing
-- in the app talks to Supabase directly from the browser. All access goes
-- through our own API layer using the service role key, which bypasses RLS
-- by design — these policies exist so a future anon/authenticated key can't
-- read anything until we deliberately open it up.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── accounts ─────────────────────────────────────────────────────────────
create table accounts (
  id uuid primary key default gen_random_uuid(),
  auth0_sub text unique,                 -- null until Auth0 is wired up
  email text not null unique,
  full_name text not null,
  handle text unique,
  avatar_url text,
  country text,
  preferred_language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function set_updated_at();

-- ── household viewer profiles (up to 5 per account, per REQUIREMENTS.md §1) ─
create table profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  avatar_url text,
  age_band text not null default 'adult' check (age_band in ('adult', 'teen', 'child')),
  parental_pin_hash text,                -- set only on child/teen profiles behind a PIN
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index profiles_account_id_idx on profiles(account_id);

-- ── organizations (channels) ────────────────────────────────────────────
-- Every channel — a personal Creator channel or a Business/Government/
-- Education/Non-profit org — is a row here. A personal channel is simply
-- an organization with exactly one membership (its owner).
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text unique,
  type text not null check (type in ('creator', 'business', 'government', 'education', 'non_profit')),
  verified boolean not null default false,
  tagline text,
  description text,
  avatar_url text,
  banner_url text,
  country text,
  business_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- ── memberships: which accounts can act on behalf of which organizations ──
create table memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  org_role text not null default 'owner' check (org_role in ('owner', 'editor', 'analyst')),
  created_at timestamptz not null default now(),
  unique (account_id, organization_id)
);

create index memberships_account_id_idx on memberships(account_id);
create index memberships_organization_id_idx on memberships(organization_id);

-- ── platform-wide role grants ────────────────────────────────────────────
-- Additive per REQUIREMENTS.md §1 — one account can hold several at once.
-- Business/Advertiser/Producer/Education require verification before the
-- role actually unlocks its studio surface.
create table account_roles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  role text not null check (role in (
    'viewer', 'creator', 'business', 'advertiser',
    'producer', 'education_provider', 'government_nonprofit', 'admin'
  )),
  verified boolean not null default false,
  granted_at timestamptz not null default now(),
  unique (account_id, role)
);

create index account_roles_account_id_idx on account_roles(account_id);

-- ── RLS: locked down until the API layer deliberately opens specific reads ─
alter table accounts enable row level security;
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table account_roles enable row level security;
