-- Real commerce, first slice (P3 in docs/DEVELOPMENT-PLAN.md): a real, Stripe-Checkout-
-- backed entitlement for buying/renting/PPV-unlocking a single video. Before this,
-- purchaseAccess() never had a real branch at all — a real paid video correctly fell
-- through to the paywall/preview state forever, since there was nothing to buy it with
-- (see mock-api/index.ts's getEntitlement() header comment). Deliberately out of scope
-- for this slice: subscriptions/channel memberships, the revenue ledger and creator
-- payouts, and receipts beyond our own invoice number — those are the rest of P3.

create sequence invoice_number_seq start 1;

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in ('rent', 'buy', 'ppv')),
  amount_minor integer not null,
  currency text not null,
  status text not null default 'completed' check (status in ('completed', 'active', 'expired', 'refunded')),
  invoice_number text not null,
  -- Unique (not just indexed): this is exactly what makes fulfilling a checkout session
  -- idempotent — the webhook and the redirect-page's own verify call race by design
  -- (see commerce.ts's fulfillCheckoutSession()), and `on conflict do nothing` relies on
  -- this constraint to make whichever one loses the race a no-op instead of a duplicate
  -- entitlement.
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index entitlements_account_id_idx on entitlements(account_id);
create index entitlements_video_id_idx on entitlements(video_id);

alter table entitlements enable row level security;
