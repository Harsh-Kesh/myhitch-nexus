-- Corrects a design mistake caught before this feature had any real usage: requiring a
-- NOT NULL video_id foreign key means an author can only write about a video that's a
-- real Postgres row they own — but real video *publishing* is still 100% mock (no real
-- account can ever own a real videos row until the P2 media pipeline exists, which is
-- blocked on the Mux account per docs/DEVELOPMENT-PLAN.md's blockers list). As designed,
-- literally no real registered account could ever use this feature, not even the demo
-- account (it has no real channel membership either). Table is still empty (built this
-- session, nothing published yet), so this is a plain constraint/column change, not a
-- data migration.
--
-- Fix: video_id becomes optional (linked only when a real catalogue video genuinely
-- exists to link, e.g. today's seeded demo catalogue or a future real upload), and
-- about_title carries the name of the work being discussed either way — the actual
-- requirement ("an analysis about their movie") never depended on the movie being a
-- real Postgres row, only on it being named.
alter table magazine_articles alter column video_id drop not null;
alter table magazine_articles add column about_title text not null default '';
alter table magazine_articles alter column about_title drop default;
