-- Real Nexus Premium subscriptions (P3, docs/DEVELOPMENT-PLAN.md) — the platform-wide
-- recurring subscription is the one subscription path with both a real UI entry point
-- (the video purchase modal) and a well-defined price/benefits already in the mock.
-- Deliberately NOT channel memberships: there is no real design for those anywhere —
-- no creator-side tier/price configuration exists even as mock scaffolding (just a
-- disconnected UI toggle in studio/channel-settings that saves nothing), and the mock's
-- own "Channel membership" button is dead — it always starts a platform subscription
-- regardless, since no call site ever passes a channelId. Building that for real would be
-- inventing a new creator-monetization feature, not making an existing mock real.
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null check (status in ('active', 'past_due', 'cancelled', 'incomplete')),
  price_minor integer not null,
  currency text not null,
  -- Stripe is the source of truth for renewal timing; kept here so the account page
  -- can show it without a Stripe API call on every read.
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_account_id_idx on subscriptions(account_id);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

alter table subscriptions enable row level security;
