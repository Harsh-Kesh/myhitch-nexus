-- Live Stream Interactive Chat & Polls (FR-6.5.3, FR-6.5.4)

create table if not exists live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null,
  account_id uuid references accounts(id) on delete set null,
  author_name text not null,
  author_avatar_url text,
  author_role text not null default 'viewer', -- viewer, creator, moderator, subscriber
  message text not null,
  is_pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists live_chat_messages_stream_idx
  on live_chat_messages(stream_id, created_at desc)
  where deleted_at is null;

create table if not exists live_stream_polls (
  id uuid primary key default gen_random_uuid(),
  stream_id text not null,
  question text not null,
  options jsonb not null default '[]'::jsonb, -- array of { "text": string, "votes": number }
  status text not null default 'active', -- active, ended
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists live_stream_polls_stream_idx
  on live_stream_polls(stream_id, created_at desc);

create table if not exists live_stream_poll_votes (
  poll_id uuid not null references live_stream_polls(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  option_index integer not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, account_id)
);
