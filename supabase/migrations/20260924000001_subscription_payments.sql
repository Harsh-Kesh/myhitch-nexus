-- Real Nexus Premium/Family/Business subscription revenue — a genuine, live gap found
-- while scoping the real admin finance page: Stripe's invoice.paid webhook has always
-- routed to recordMembershipPaymentFromInvoice() (channelMemberships.ts), which
-- deliberately no-ops for a platform-wide plan invoice (no channelId in the
-- subscription's metadata) — that function was only ever meant to catch channel-
-- membership invoices. Real subscription payments have been collected via Stripe with
-- zero local record of them. This table is the mirror-image counterpart:
-- recordSubscriptionPaymentFromInvoice() (subscriptions.ts) records here specifically
-- when channelId is *absent*, so the two functions are exact complements and can never
-- double-count the same invoice.
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  plan text not null check (plan in ('premium', 'family', 'business')),
  amount_minor integer not null,
  currency text not null,
  stripe_invoice_id text not null unique,
  created_at timestamptz not null default now()
);

create index subscription_payments_account_id_idx on subscription_payments(account_id);
create index subscription_payments_created_at_idx on subscription_payments(created_at);

alter table subscription_payments enable row level security;
