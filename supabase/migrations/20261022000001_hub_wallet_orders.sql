-- Renting/buying a movie in the MYHitch app, paid from the customer's MYHitch Wallet
-- (src/lib/server/hubWallet.ts, routes under src/app/api/hub/app/wallet/). The MYHitch
-- hub asks Nexus for a quote (priced exactly like the app's card checkout, no Stripe
-- PaymentIntent), takes the money from the wallet, transfers the business its share to
-- its Business Portal Stripe connected account, then asks Nexus to confirm — or, if
-- anything failed, undoes it all and asks Nexus to release the quote.
--
-- One row per quote. It holds the quoted price and split so confirm can check the amount
-- and never re-prices, the state (quoted -> confirmed | released; confirmed -> refunded),
-- and, once confirmed, the hub's wallet payment reference and Stripe transfer ids (the
-- transfers live on the Portal's Stripe account, not Nexus's) plus the entitlement it
-- granted. The entitlement itself is an ordinary `entitlements` row keyed
-- 'wallet_<quote_id>' (no Nexus PaymentIntent), so it shows on the website and in the
-- app's purchases like any other.
--
-- Additive and re-runnable: nothing existing is altered. Until it's applied the wallet
-- routes answer 503 { code: "wallet_not_ready" }; card checkout is unaffected.
create table if not exists hub_wallet_orders (
  quote_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  myhitch_user_id text not null,
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in ('rent', 'buy')),
  -- The seller (videos.channel_id) and its Portal connected account at quote time.
  organization_id uuid not null references organizations(id) on delete cascade,
  connected_account_id text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'AUD',
  platform_fee_minor integer not null check (platform_fee_minor >= 0),
  payee_minor integer not null check (payee_minor >= 0),
  status text not null default 'quoted' check (status in ('quoted', 'confirmed', 'released', 'refunded')),
  expires_at timestamptz not null,
  wallet_reference text unique,
  transfer_ids text[] not null default '{}',
  entitlement_id uuid references entitlements(id) on delete set null,
  confirmed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_wallet_orders_account_id_idx on hub_wallet_orders(account_id);
create index if not exists hub_wallet_orders_entitlement_id_idx on hub_wallet_orders(entitlement_id);

drop trigger if exists hub_wallet_orders_set_updated_at on hub_wallet_orders;
create trigger hub_wallet_orders_set_updated_at
  before update on hub_wallet_orders
  for each row execute function set_updated_at();

alter table hub_wallet_orders enable row level security;
