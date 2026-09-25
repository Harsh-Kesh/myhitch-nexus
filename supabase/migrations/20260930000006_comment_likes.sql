-- Real per-account comment likes — the "like a comment" button was pure static display
-- text (`{compactNumber(comment.likes)}`, no button, no click handler at all anywhere in
-- the code) with nothing behind it to click. `video_comments.likes` stays the real,
-- live counter it already was (same "seeded baseline, incremented by real actions from
-- there" pattern as videos.views/likes) — this table only adds the real per-account
-- toggle/uniqueness guard so the same account can't like a comment twice or have its like
-- silently lost.
create table if not exists video_comment_likes (
  comment_id uuid not null references video_comments(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, account_id)
);

create index if not exists video_comment_likes_account_idx on video_comment_likes(account_id);
