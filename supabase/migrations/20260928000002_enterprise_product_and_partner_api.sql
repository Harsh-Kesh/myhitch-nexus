-- Enterprise Product: Developer & Partner API (TPI-9), Client Reviews, and Large File Transfers
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default array['read:catalogue', 'embed:player'],
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_org_id_idx on api_keys(org_id);
create index if not exists api_keys_key_prefix_idx on api_keys(key_prefix);

create table if not exists client_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  video_id text not null,
  token text not null unique,
  title text not null,
  client_name text not null,
  client_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  feedback text,
  version integer not null default 1,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_reviews_org_id_idx on client_reviews(org_id);
create index if not exists client_reviews_token_idx on client_reviews(token);

create table if not exists enterprise_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_size_bytes bigint not null,
  download_url text,
  status text not null default 'active' check (status in ('active', 'expired')),
  download_count integer not null default 0,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index if not exists enterprise_transfers_org_id_idx on enterprise_transfers(org_id);
