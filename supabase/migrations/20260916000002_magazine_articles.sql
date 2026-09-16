-- MYHitch Lens magazine / thesis publishing, Nexus-side (docs/DEVELOPMENT-PLAN.md —
-- Lens/magazine research, 2026-09-16). Built entirely inside Nexus rather than waiting on
-- Lens, whose own build status and API readiness are unknown and which the signed
-- requirements document only ever committed to "embed or cross-publish" as a late-phase
-- integration — nothing in that description implies Lens owns long-form editorial
-- authoring. When Lens is ready, it becomes a consumer of this table via a small read
-- API, not a rebuild.
--
-- State machine (draft -> submitted -> changes_requested|published|rejected|withdrawn)
-- matches what every real editorial system studied converges on (Editorial Manager, OJS,
-- Medium's publication model) — a human decision gate between "written" and "public",
-- since the conflict-of-interest problem here (the author writing about their own film)
-- means this can never be a straight-to-publish form.
create table magazine_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  video_id uuid not null references videos(id) on delete cascade,
  author_account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  dek text,
  body_html text not null default '',
  -- Always true today (this feature only exists for a creator writing about their own
  -- upload) but kept as an explicit column rather than assumed, so the "Filmmaker's
  -- Analysis" disclosure badge is driven by real data if third-party critics are ever
  -- allowed to submit here too.
  is_filmmaker_analysis boolean not null default true,
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'changes_requested', 'published', 'rejected', 'withdrawn'
  )),
  reviewer_notes text,
  reviewed_by uuid references accounts(id),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index magazine_articles_video_id_idx on magazine_articles(video_id);
create index magazine_articles_author_idx on magazine_articles(author_account_id);
create index magazine_articles_status_idx on magazine_articles(status);

create trigger magazine_articles_set_updated_at
  before update on magazine_articles
  for each row execute function set_updated_at();

alter table magazine_articles enable row level security;
