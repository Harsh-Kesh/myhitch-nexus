# Operations

Deployment, monitoring, backup and recovery, as they actually exist today. Where something is a real, tested capability it's described as one; where it's a platform capability that exists but hasn't been exercised as a deliberate drill, that's said plainly rather than implied.

## Architecture at a glance

- **App**: Next.js, deployed on Railway. `next build && next start` in production — the same command the e2e suite runs locally against, so a local pass is a meaningful signal for a real deploy.
- **Database**: a single shared Supabase Postgres instance. There is currently **one environment, not separate dev/staging/production databases** — every migration, seed script and even a local `npm run test:e2e` run reads and writes the same real data the live site serves. This is a deliberate, documented tradeoff for this build's stage (see `docs/DEVELOPMENT-PLAN.md`), not an oversight, but it means any local script that touches the database is a production action.
- **Error tracking**: Sentry, configured via `NEXT_PUBLIC_SENTRY_DSN`.
- **Search**: Typesense, backing real catalogue search and browse.
- **Payments**: Stripe, live in test/sandbox mode (Checkout, Billing subscriptions, Connect payouts, webhooks).

## Deployment

1. Push to `main` on GitHub — Railway is connected to this repository and builds/deploys automatically on push.
2. Railway runs `next build` and, on success, swaps traffic to the new build. There is no separate manual deploy step.
3. Watch the Railway deployment logs for build failures; a failed build leaves the previous version serving traffic (Railway doesn't cut over until the new build succeeds).

**Before pushing anything that changes app behaviour**: run `npx tsc --noEmit` and `npm run build` locally first — both are fast, free, and catch the large majority of deploy-time failures before they reach Railway's build queue.

**Environment variables** live in Railway's own dashboard for production, and in `.env.local` (gitignored) for local development — the two are not automatically synced. `.env.example` documents every variable the app expects; a variable missing from Railway's production config fails the same way it does locally (most integrations throw a clear "not configured" error rather than a silent failure — see `stripeClient.ts`'s `StripeNotConfiguredError` for the pattern followed throughout).

## Monitoring

- **Error tracking**: real, via Sentry — unhandled exceptions on both client and server are captured today.
- **Uptime/latency alerting**: not yet configured. There is no paged alert today if the site goes down or slows down; the first signal would be Sentry's own error volume or a manual check.
- **Scheduled health checks**: not yet configured.

Setting up uptime alerting (e.g. a simple external ping against the homepage and a couple of API routes, alerting to email/Slack on failure) is a small, well-scoped task deliberately held as a pre-launch item rather than done ad hoc today — see the note on AC-10 in `docs/DEVELOPMENT-PLAN.md`.

## Backups and recovery

- **Database**: Supabase's own plan-level backups apply (point-in-time recovery, retention depending on the project's plan tier) — this is a platform capability, not something this codebase configures. **It has not been exercised as a real restore drill.** Treat "we have backups" and "we have a tested restore procedure" as two different claims until the second one is actually done.
- **Application**: stateless — a bad deploy is recovered by redeploying the last known-good commit (`git revert` + push, or re-running Railway's deploy for a previous build if Railway's UI offers a one-click redeploy on this plan). There is no separate application-state backup to restore, since nothing persists outside Postgres and Stripe.
- **Rollback drill**: not yet performed. The mechanism above is believed correct based on how Railway and Git work, but "believed correct" and "tested under pressure" are different things — this is the other half of the AC-10 item already flagged as a deliberate pre-launch measure, not done today.

## Incident response (today's reality)

There is no on-call rotation or paging system yet. If something breaks in production:

1. Check Sentry first for the error.
2. Check Railway's deployment logs for a build/runtime issue.
3. If a recent deploy caused it, revert the commit and push — Railway redeploys automatically.
4. If it's data-related, remember the single-shared-database fact above before running any corrective script — a "fix" run locally is a real production write.

## What's deliberately not done yet

Explicitly deferred, not overlooked — each needs a scheduled, low-traffic window and sign-off rather than being slipped into routine work:

- A real third-party penetration test.
- A scheduled uptime/alerting setup.
- A real, timed backup-restore drill.
- A real rollback drill under simulated failure.

These four are the practical content of "AC-10 (Operations)" in the traceability doc. They're infrastructure/process work, not code changes, and are correctly sequenced as pre-launch measures rather than done piecemeal today.
