-- Real commission configuration — closes the "configurable commission" half of P3's
-- revenue-ledger bullet, left deliberately unconfigured (gross-only) in the earlier
-- slices today. Multiple rows per scope, never updated in place: a rate change only
-- ever applies to new transactions from that point on, matching what the admin
-- Settings page has always told the client ("Changing a split takes effect for new
-- transactions only") — a promise the mock UI never actually had any config behind.
-- Seeded with the same splits the mock prototype always showed, now as real starting
-- values a real admin can actually change (see src/lib/server/commissions.ts).
create table commission_rates (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('purchase_rental', 'ppv', 'membership')),
  platform_share_pct integer not null check (platform_share_pct between 0 and 100),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index commission_rates_scope_effective_idx on commission_rates(scope, effective_from desc);

insert into commission_rates (scope, platform_share_pct, effective_from) values
  ('purchase_rental', 30, now() - interval '400 days'),
  ('ppv', 25, now() - interval '220 days'),
  ('membership', 15, now() - interval '11 days');

alter table commission_rates enable row level security;
