-- Migration for FR-6.6.4: Community guidelines acknowledgement and graduated enforcement ladder

-- 1. Expand legal_acceptances to allow 'community_guidelines' document_type
alter table legal_acceptances drop constraint if exists legal_acceptances_document_type_check;
alter table legal_acceptances add constraint legal_acceptances_document_type_check 
  check (document_type in ('terms_and_privacy', 'community_guidelines'));

-- 2. Community guidelines strike ladder table
create table if not exists community_strikes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  moderation_item_id uuid references moderation_queue(id) on delete set null,
  target_type text not null, -- 'content', 'comment', 'channel'
  target_id text not null,
  reason text not null,
  strike_level integer not null, -- 1 = warning, 2 = upload_freeze, 3 = demonetised, 4 = suspended
  penalty text not null, -- 'warning', 'upload_freeze', 'demonetised', 'suspended'
  created_at timestamptz not null default now(),
  expires_at timestamptz default (now() + interval '90 days')
);

create index if not exists community_strikes_account_id_idx on community_strikes(account_id);
create index if not exists community_strikes_created_at_idx on community_strikes(created_at);

-- 3. Add upload_restricted_until to organizations (channels) for temporary upload freeze
alter table organizations add column if not exists upload_restricted_until timestamptz;

-- 4. Enable RLS
alter table community_strikes enable row level security;
