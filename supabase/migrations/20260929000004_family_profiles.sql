-- Family Profiles & Parental Controls (Family Tier: "Up to 5 family profiles & parental controls")
create table if not exists account_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  avatar_url text,
  is_kids boolean not null default false,
  maturity_rating text not null default 'ALL' check (maturity_rating in ('ALL', 'PG', 'TEEN', '18+')),
  pin_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_profiles_account_id on account_profiles (account_id, created_at asc);
