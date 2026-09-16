-- The Nexus -> Lens submission handoff — docs/DEVELOPMENT-PLAN.md's 2026-09-16
-- correction entry. Lens (a separate, real article-writing platform) owns publication
-- and editorial review of a Magazine article, not Nexus, so an article's status now
-- moves to 'published'/'rejected' only via Lens's own callback (see
-- src/app/api/integrations/lens/status/route.ts), identified by the id Lens's own
-- submission-intake endpoint returns.
alter table magazine_articles add column lens_submission_id text;
alter table magazine_articles add column lens_url text;

-- Safe lookup target for the webhook — a submission id should resolve to exactly one
-- article. Partial (not-null only) since most rows won't have one yet, or ever, if Lens
-- was never reachable at submit time.
create unique index magazine_articles_lens_submission_id_idx
  on magazine_articles(lens_submission_id)
  where lens_submission_id is not null;
