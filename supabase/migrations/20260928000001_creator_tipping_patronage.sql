-- Creator Tipping & Patronage (Fan subscriptions & tips)
create table if not exists creator_tips (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null,
  account_id uuid references accounts(id) on delete set null,
  supporter_name text not null,
  supporter_email text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'aud',
  message text,
  is_patron boolean not null default false,
  stripe_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'refunded')),
  platform_fee_cents integer not null default 0,
  creator_amount_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists creator_tips_channel_id_idx on creator_tips(channel_id);
create index if not exists creator_tips_account_id_idx on creator_tips(account_id);
create index if not exists creator_tips_status_idx on creator_tips(status);
create index if not exists creator_tips_created_at_idx on creator_tips(created_at desc);
