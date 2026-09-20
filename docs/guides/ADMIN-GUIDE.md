# Administrator guide

Covers everyday moderation and platform-configuration work in `/admin`. For architecture and what's real vs. simulated, see `docs/DEVELOPMENT-PLAN.md` and `docs/SRS-TRACEABILITY.md` — this guide only covers how to use the screens that already exist.

## Getting admin access

There is no self-service way to become an admin — registering with `role=admin` is deliberately rejected (a real access-control gap was found and closed here; see `e2e/authorization.spec.ts`'s `AUTHZ-0` test). An existing admin grants the role from **Users** (below), or the platform's owner runs a one-off database grant for the first admin account.

## Dashboard (`/admin`)

The landing page. Six queue tiles (pending content, reported content, copyright claims, live incidents, verification, campaigns) link straight into the matching filtered view in **Reviews**. Below that: platform totals, a 30-day moderation-load chart, and a live feed of the most recent audit-log entries. Nothing here needs configuration — it's a read-only summary.

## Reviews (`/admin/reviews`)

The one queue for everything that needs a human decision: pending uploads, viewer reports, copyright claims, live-stream incidents, and business verification applications. Use the tabs across the top to filter by queue; each item shows what triggered it and who's affected.

- **Approve** clears the item and, for content, makes it publicly visible.
- **Reject** requires a reason (shown to the affected creator/business) and keeps the content unpublished.
- Every decision writes a real, permanent entry to **Audit logs** — there is no undo from this screen; if a decision was wrong, take a new action (e.g. re-approve) rather than expecting the log entry to disappear.

An empty queue shows "Queue is clear" rather than a blank screen — that's the correct state when there's genuinely nothing pending, not a bug.

## Users (`/admin/users`)

Search by name, email or handle. Opening a user shows their roles, verification status and history. This is the only place to grant or revoke a role (including `admin`) — every grant/revoke asks for a reason and is written to the audit log.

## Organisations (`/admin/organisations`)

Lists organisations with a submitted verification application, filterable by status. Approving or rejecting here updates the business account's real verification state immediately and records a timeline entry. If this list is empty, it means no organisation currently has an application pending — not that the feature is broken.

## Content (`/admin/content`)

A searchable list of every video on the platform with its real status, view count and channel. Use this to find a specific title outside the review-queue flow (e.g. to double-check something a viewer reported by name).

## Cases (`/admin/reports`)

Two sections. **Copyright claims** are real — filed by rights holders against real content, and a decision here (uphold/reject/restore) issues a real strike against the channel on an uphold. **Legal / safety / payment cases** below that are a simulated case-management demo (no real consumer table behind them yet) — useful for reviewing the intended workflow, not for real incidents today.

## Settings (`/admin/settings`)

Seven tabs. Two are real, persisted configuration:

- **Categories** — add a category or toggle "Featured"; changes are live immediately on `/explore` and in the upload wizard's category picker.
- **Commissions** — the platform's cut of each revenue type (rentals/purchases, PPV, memberships). Editing inserts a new rate effective immediately; past transactions keep whatever rate was in effect when they happened, so historical revenue reports never retroactively change.

The remaining five tabs (Content labels, Pricing rules, Taxes, Currencies, Payout rules) are a working UI demo with no real backing table yet — nothing else in the app reads them today, so a change here doesn't affect checkout, tax calculation or payouts. Treat them as a preview of the intended screen, not a live control, until a real consumer for that data is built.

## Audit logs (`/admin/audit-logs`)

A permanent, append-only record of every administrative action (moderation decisions, role grants, config changes) with actor, target, reason and severity. Filter by severity or target type. Nothing here is cleared on reload — there's deliberately no delete action from this screen.

## Things that look like admin features but aren't real yet

- **Live** (`/admin/live`) and **Advertising** (`/admin/ads`) are simulated — no real live-streaming or ad-delivery infrastructure exists behind them (documented future phases P5/P6).
- **Finance** (`/admin/finance`) states plainly that its figures are simulated — no real settlement/tax/payout provider is integrated.

Both are clearly labelled as such in the UI itself; if a screen doesn't say "simulated" or "mock," its numbers are real.
