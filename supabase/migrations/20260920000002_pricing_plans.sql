-- Real subscription plans (Nexus Free/Premium/Family/Creator/Business/Enterprise) per
-- the client's pricing graphic, replacing the single hardcoded "Nexus Premium" plan and
-- retiring channel memberships / per-video rent-buy-PPV, none of which appear in that
-- model at all — every video is either Free or requires a paid plan. channel_id and the
-- membership_payments/channel_membership_tiers tables from 20260918000005 are left in
-- place (not dropped) so existing real membership rows/history stay queryable; new
-- subscriptions are never created with a channel_id going forward.
alter table subscriptions add column plan text not null default 'premium'
  check (plan in ('premium', 'family', 'business'));
alter table subscriptions add column billing_interval text not null default 'month'
  check (billing_interval in ('month', 'year'));

-- Enterprise is "Contact Sales", not a self-service checkout — a real lead record an
-- admin can see and action, same "real, honest state" as every other lead-gen flow
-- already built (business/leads).
create table sales_inquiries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  full_name text not null,
  email text not null,
  company text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index sales_inquiries_status_idx on sales_inquiries(status);

alter table sales_inquiries enable row level security;
