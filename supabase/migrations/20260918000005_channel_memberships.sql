-- Real channel memberships (P3) — closes the gap flagged in
-- 20260918000002_subscriptions.sql's own header comment: a real creator-configured
-- price per channel, a way to tell a channel membership apart from platform Premium on
-- the same subscriptions table, and a revenue ledger for it. One tier per channel (no
-- multi-tier pricing) — the mock UI only ever showed a single "From £4.00/month" price
-- per channel, so that's the real scope this closes, not a bigger multi-tier system.
alter table subscriptions add column channel_id uuid references organizations(id) on delete cascade;
create index subscriptions_channel_id_idx on subscriptions(channel_id) where channel_id is not null;

create table channel_membership_tiers (
  channel_id uuid primary key references organizations(id) on delete cascade,
  price_minor integer not null check (price_minor > 0),
  currency text not null default 'GBP',
  benefits text[] not null default '{}',
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger channel_membership_tiers_set_updated_at
  before update on channel_membership_tiers
  for each row execute function set_updated_at();

alter table channel_membership_tiers enable row level security;

-- A subscription renews on its own schedule outside of any one checkout, unlike a
-- one-time entitlement — so membership revenue is credited per invoice paid (the
-- webhook's invoice.paid handler), not per signup. Denormalized account_id/channel_id
-- rather than a subscription_id foreign key: invoice.paid can arrive before the
-- corresponding customer.subscription.created event has been processed, and this way
-- recording a payment never depends on event ordering.
create table membership_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  channel_id uuid not null references organizations(id) on delete cascade,
  amount_minor integer not null,
  currency text not null,
  stripe_invoice_id text not null unique,
  created_at timestamptz not null default now()
);

create index membership_payments_channel_id_idx on membership_payments(channel_id);

alter table membership_payments enable row level security;
