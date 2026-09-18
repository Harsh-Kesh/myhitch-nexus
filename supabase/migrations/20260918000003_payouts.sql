-- Real creator payouts via Stripe Connect (P4, docs/DEVELOPMENT-PLAN.md) — the last piece
-- of real commerce this pass: a channel's real revenue (20260918000001_entitlements.sql,
-- the revenue-ledger slice) has had nowhere real to go out to until now. Express accounts
-- (Stripe-hosted onboarding, Stripe handles the KYC/compliance UI) — this app never
-- collects or sees bank details or identity documents itself, matching the same
-- boundary Pass's own Stripe Connect integration already draws.
create table payout_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payout_accounts_set_updated_at
  before update on payout_accounts
  for each row execute function set_updated_at();

-- One row per real Stripe Transfer out to a connected account. "Available to withdraw"
-- is computed as real gross revenue (entitlements) minus the sum of these — see
-- payouts.ts's getAvailableBalance(). No commission is deducted (still mock-only config,
-- same reasoning as the revenue-ledger slice), so this is gross, not net; documented as
-- an honest simplification, not silently assumed.
create table payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_transfer_id text not null unique,
  amount_minor integer not null,
  currency text not null,
  status text not null default 'paid' check (status in ('paid', 'failed')),
  created_at timestamptz not null default now()
);

create index payouts_organization_id_idx on payouts(organization_id);

alter table payout_accounts enable row level security;
alter table payouts enable row level security;
