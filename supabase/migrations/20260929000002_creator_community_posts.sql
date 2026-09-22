-- Creator Community Posts, Announcements & Comments (Creator Tier Feature)

create table if not exists creator_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references organizations(id) on delete cascade,
  author_id uuid references accounts(id) on delete set null,
  title text,
  content text not null,
  media_urls text[] default array[]::text[],
  audience text not null default 'public', -- 'public', 'subscribers', 'patrons'
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_posts_channel_idx
  on creator_posts(channel_id, created_at desc);

create table if not exists creator_post_likes (
  post_id uuid not null references creator_posts(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, account_id)
);

create table if not exists creator_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references creator_posts(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  author_name text not null,
  author_avatar_url text,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists creator_post_comments_post_idx
  on creator_post_comments(post_id, created_at asc);
