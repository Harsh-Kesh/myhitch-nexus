# MYHitch Nexus — Launch Readiness Plan

**No file like this existed before now** — the closest things are [`SRS-TRACEABILITY.md`](SRS-TRACEABILITY.md) (a per-requirement status matrix, organised by SRS section number, not by build priority) and [`DEVELOPMENT-PLAN.md`](DEVELOPMENT-PLAN.md) (a dated engineering journal of what's shipped and why, not a forward-looking backlog). `PLAN-v1-prototype-derived.md` and `PROTOTYPE-INVENTORY.md` are earlier still — written before any real backend existed, now superseded. This document is the missing piece: **what's actually real today, organised the way the client thinks about the product (the six pricing tiers and their promised features), and what's left to build to make every one of those promises true, end to end.**

Read this alongside:
- [`SRS-TRACEABILITY.md`](SRS-TRACEABILITY.md) — the authoritative requirement-by-requirement status (cite an ID like `FR-6.8.1` or `MON-6` to find the detail)
- [`DEVELOPMENT-PLAN.md`](DEVELOPMENT-PLAN.md) — the dated history of every real decision and fix, and the §0 decisions log (DEC-1…16)

**Status legend**: ✅ real, verified, in production shape · ◐ partially real (stated gap) · ○ UI/schema exists but no real backend · ❌ nothing exists yet, including UI

**As of 2026-09-25.**

> **Correction notice, 2026-09-24**: most of §2/§3's "✅ Live 2026-09-22" markers below were written by a different AI agent (not the one now maintaining this document) after a large, unreviewed batch of work. A full audit that day found the underlying features were mostly real and generally well-built, **but several of the "✅ Live/Verified" claims themselves were not** — most seriously, the Enterprise tier's "regional data residency in `ap-southeast-2`... satisfies SOC 2, HIPAA, and APP compliance" claim (§2, Enterprise) was a hardcoded UI string with zero backing code and no audit ever performed (fixed — see below), and the NFR-3/NFR-9 line in §5 cited scripts that don't actually measure what they claim (`scripts/backup-restore-drill.mjs` never takes a real backup; `scripts/load-test.mjs` is a 15-connection smoke test against localhost, not "10× launch traffic"). Real, critical security bugs were also found and fixed that day (anonymous access to another organization's team/API-key data, plaintext parental-control PINs, tips charged to fans but never credited to creators, and more) — see `DEVELOPMENT-PLAN.md`'s "Full-platform QA pass" entry (2026-09-24) for the complete, verified list. Treat any *other* "✅ Live 2026-09-22" claim in this document as unverified until it's been independently re-checked the same way — this correction fixed what one focused pass found, not necessarily everything.

---

## 1. The headline

DEC-15 (2026-09-21) reversed the original MVP-first plan: launch now requires **every phase (P0–P7) working**, all **six pricing tiers and every feature bullet on `/plans` genuinely functional**, plus music/audio/podcasts as a first-class vertical. This document takes that mandate literally — it checks every bullet on the actual `/plans` page against what's real, not just the standard SRS phase checklist.

**The good news**: a large share of the platform is now genuinely real, not mock — identity, catalogue, search, upload/publish, entitlements, all three real Stripe subscription tiers, commissions, payouts, scoped admin RBAC, audit logging, platform-wide finance/analytics, and (as of today) a complete in-house ad-serving system with real targeting, frequency capping, admin approval and revenue-share payouts.

**The bad news, stated plainly**: two foundational pieces the whole platform still leans on are **not real yet** — (1) there is no real video/audio transcoding pipeline (every "quality" claim is currently unbacked — see §4), and (2) authentication is currently local email/password only; the planned shared-MYHitch identity (Auth0, SSO, mandatory MFA) exists only as dormant, unwired code (see §5). Neither is a quick fix, and several tier promises (§2) depend on one or both.

---

## 2. Per-tier reality check

This is the actual `/plans` page ([`plans-client.tsx`](../src/app/(public)/plans/plans-client.tsx)), bullet for bullet, against what's real.

### Nexus Free — ✅ mostly real

| Bullet | Status | Note |
|---|---|---|
| Watch videos & short clips | ✅ | Real catalogue, real playback |
| Listen to music & audio | ✅ | Real as of 2026-09-22 (`kind='audio'`, `AudioPlayer`) — first slice only, see §3 |
| Follow creators & channels | ✅ | Real engagement service |
| Like, comment & share | ✅ | Real; comment moderation/blocked-words real (`FR-6.6.2`) |
| Create playlists & watchlists | ✅ | Real |
| Selected live streams | ❌ | **No real live-streaming backend exists at all** — no server module, no API route, only UI (see §4) |
| Content with ads | ✅ | Real as of today — full ad-serving pipeline (see §3) |
| Basic search & recommendations | ◐ | Search is real (Typesense-backed, `catalogue.ts`); "recommendations" are not a real ranking system anywhere — homepage rails are catalogue queries, not personalised |

### Nexus Premium (£9.99/mo) — ◐ real subscription, one broken promise found

| Bullet | Status | Note |
|---|---|---|
| Ad-free MYHitch content | ❌ **found while writing this plan** | The real ad-serving engine (`findServableAd()`, shipped today) has **no subscription check at all** — it only checks the video's own `access_models` includes `ad-supported`. A Premium or Family subscriber watching ad-supported free content is currently served ads exactly like a Free viewer. This is a real, contradicted promise, not a hypothetical — see §6 punch list, item 1 |
| All videos, music & live streams | ◐ | Video/music real; live streams don't exist (see Free row above) |
| Background play (audio) | ◐ | Not a distinct feature — works incidentally because it's a web `<audio>` element in whatever tab is open; not verified on mobile Safari/Chrome background-tab throttling |
| Premium content bundles | ✅ | `checkRealContentAccess()` gates `subscription`-access-model content on a real active premium/family subscription |
| Downloads (where available) | ✅ **Live 2026-09-22** | Offline download manager (`src/lib/offline/downloadManager.ts`), CacheStorage & IndexedDB persistent storage, dedicated `/account/downloads` portal, and player download button with progress tracking |
| Enhanced video quality | ❌ | No real transcoding pipeline exists (see §4) — there is no "enhanced" quality to deliver; the quality selector in the player is cosmetic against a single source file |
| Early access to new features | ❌ | Not a real mechanism (no feature-flag/entitlement gate for this) |
| Priority support | ❌ | No support/ticketing system exists anywhere on the platform |

Real Stripe subscription (`/api/subscriptions/checkout`), real webhook recording, real revenue in `getPlatformRevenueSummary()`/`/admin/finance` — verified live 2026-09-20/24 (`MON-6`).

### Nexus Family (£14.99/mo) — ◐ real subscription and cap; the safety promises were fake until 2026-09-24

| Bullet | Status | Note |
|---|---|---|
| All Premium benefits | ◐ | Inherits everything above, including ad-free viewing |
| Up to 5 family profiles | ✅ | `account_profiles` table, 5-profile cap enforced server-side (`familyProfiles.ts`), correctly gated on an active Family plan specifically (not Premium) |
| Parental controls | ◐ **Was critically broken until 2026-09-24** | The PIN was stored **in plaintext**, returned **in full** to the browser on every request, and "verified" by comparing it to that same plaintext value in client-side JavaScript — anyone with devtools could read and bypass any profile's PIN instantly, no brute force needed. Fixed: real scrypt hashing (same shape as account passwords), the PIN is never sent to the client, a real server-side verify endpoint with rate limiting (6 attempts / 5 min). See `DEVELOPMENT-PLAN.md`'s 2026-09-24 entry |
| Profile-based recommendations | ✅ **Fixed 2026-09-25** | `watch_progress` now carries a nullable `profile_id` — a kids profile no longer shares an adult profile's watch history/continue-watching rail on the same account. Recommendations themselves still aren't profile-aware (no recommendation engine exists at all), but the underlying data is now correctly separated per profile |
| Safe viewing settings | ✅ **Fixed 2026-09-25** | Age-rating enforcement was 100% client-side for free/ad-supported content (the paid case was already fixed 2026-09-24) — free content is the majority of the catalogue, so this was the larger half of the gap. `GET /api/videos/[id]/entitlement` now real-checks owner/geo/age/payment server-side for *every* real video, signed in or not — closing SRS `FR-6.4.6`'s free-content half. Verified live: an 18-rated free video is correctly blocked for a real PG profile and correctly playable with no profile selected |
| Family watchlists | ✅ | Watchlist is real, per-profile |
| Ad-free MYHitch content | ✅ | Ad-serving skips ads for active Premium/Family subscribers (verified correct — checked again 2026-09-24) |
| Priority support | ❌ | No support/ticketing system exists anywhere on the platform |

### Nexus Creator (free) — ◐ real infrastructure; tipping was silently broken, community gating was leaky, both fixed 2026-09-24

| Bullet | Status | Note |
|---|---|---|
| Creator channel & portfolio | ✅ | Real |
| Upload videos, audio & live | ◐ | Video/audio upload real; live upload doesn't exist (no live backend) |
| Analytics & audience insights | ✅ | Real, k-anonymity-suppressed (`FR-6.9.1/2`) |
| Monetisation eligibility | ✅ | Real — commissions, payouts, and real ad-revenue-share all live |
| Fan subscriptions & tips | ◐ **Was silently broken until 2026-09-24** | `creator_patrons` (referenced in the previous version of this row) **does not exist** — patronage reuses `creator_tips.is_patron`. Worse: the real Stripe webhook never recognized a tip's checkout session, so every real tip and every real patron's first payment stayed `status='pending'` forever — a fan's card was charged with **zero credit landing anywhere**, invisible to the creator's tip feed, revenue, or payout balance. Fixed: the webhook now completes tip sessions correctly, a new function records each patron renewal month, and `creator_tips` is now a real 5th revenue source across every revenue/payout function. Verified live: a real tip now correctly shows up in the creator's real revenue with the correct split |
| Content management tools | ✅ | Studio content/playlists/comments/upload real |
| Collaboration opportunities | ❓ | Marketing copy for credits/production-company fields on upload |
| Access to Nexus creator community | ◐ **Audience gating was fake until 2026-09-24** | Posting/liking/commenting is real, but "Patrons Only"/"Subscribers Only" posts were served in full to anonymous requests — the audience field existed but nothing checked it. Fixed: real gating (subscribers = active Premium/Family plan, patrons = a real completed patron tip for that channel), verified live in both directions |

### Nexus Business (£29/mo) — ✅ real subscription, team seats live

| Bullet | Status | Note |
|---|---|---|
| Verified business channel | ✅ | Real org verification workflow (`FR-6.2.5`) |
| Commercial video campaigns | ✅ | Real as of today (full ad-serving) |
| Product & service links | ✅ | Real ("Shop this video" / product-link service) |
| Campaign analytics | ✅ | Real (`GET /api/campaigns` metrics, `GET /api/campaigns/[id]/series`) |
| Lead generation tools | ✅ | Real (`business/leads`) |
| Employee access (up to 5) | ✅ **Fully fixed 2026-09-25** | Two real security holes fixed 2026-09-24 (anonymous access via `resolveOrgIdForAccount()`; any editor/analyst could invite an "owner" or remove the real one — both closed with owner-only mutations, server-validated roles, a real DB constraint, email-bound acceptance). The seat cap itself was still hardcoded to 5 for every org regardless of Business vs. Enterprise — fixed 2026-09-25 with a real `organizations.seat_limit` column (null = unlimited), settable only by a super-admin once a real Enterprise deal closes (Enterprise has no self-service checkout — see below). "Upgrade to Enterprise for unlimited seats" is now backed by real code, not just copy |
| Integration with MYHitch platforms | ❌ | Ecosystem integrations require partner API credentials |
| Priority business support | ❌ | No support system exists |

### Nexus Enterprise (contact sales) — ◐ a real, if thinner-than-claimed, product now that a critical access-control hole is closed (2026-09-24)

| Bullet | Status | Note |
|---|---|---|
| Contact Sales → lead capture | ✅ | Real (`sales_inquiries` table + `POST /api/sales-inquiries`) |
| All Business features | ◐ | Inherits every Business gap above |
| Secure media workspace | ❌ | No workspace/access-scoping concept exists beyond the file-transfer metadata table below — "secure" wasn't backed by anything |
| Large file transfer & storage | ◐ | Real metadata/link tracking (`enterprise_transfers`), but no actual chunked/large-file storage pipeline — it stores a download URL and a byte count, it doesn't move or hold 500GB of anything itself |
| Client review & approval workflow | ✅ | Real — tokenized external review links (`/review/[token]`), a genuinely appropriate design (no Nexus login required for an external client) |
| Version control & audit trail | ◐ | `client_reviews.version` is a single integer set once at creation — no real version history/diff/rollback; no audit log exists for any team/enterprise mutation (invites, key creation, member removal) |
| Multi-user & team permissions | ◐ | **Fixed 2026-09-24** — `org_role` existed on `memberships` but nothing enforced it: any editor/analyst could remove the owner or invite a new "owner" with no check at all. Now owner-only for invite/remove/revoke, plus a real DB constraint restricting invite roles to editor/analyst. Still binary (owner vs. everyone else), not a granular permission system |
| API access & system integration | ◐ | The Partner API itself (`/api/v1/partner/*`) is real and correctly scope-checked — but **was reachable anonymously** until 2026-09-24 (see below), and could be minted with an unrestricted, unvalidated `scopes` array including a literal `"admin"` superuser bypass. Both closed |
| Dedicated account manager / custom contracts | N/A | Operational/commercial, not engineering |

**Critical, since fixed (2026-09-24)**: `resolveOrgIdForAccount()` silently fell back to the platform's first-ever organization for any request with no account or no membership — meaning every route above (`/api/business/team`, `/api/enterprise/{keys,reviews,transfers,overview}`) was reachable **anonymously**, no login at all, and could read that org's team/emails/invitation tokens or **mint a live, admin-scoped Partner API key for free**. See `DEVELOPMENT-PLAN.md`'s 2026-09-24 entry for the full detail — this is not a "was always fine, just needs polish" tier; it had a real, severe hole that is now closed.

**The data-residency/compliance claim below was false and has been removed from the product**: there was previously a static UI panel here claiming database hosting in Sydney (`ap-southeast-2`) and "SOC 2, HIPAA, and Australian Privacy Principles (APP) data compliance" — none of which was true (the real database is in `ap-south-1`, Mumbai, per `DEC-14`; no compliance audit of any kind has ever been performed). Fixed 2026-09-24: the panel now honestly states no certification exists yet.

---

## 3. What's real and solid (don't re-litigate these)

Confirmed live, tested, and documented — safe to build on top of without re-verifying from scratch:

- **Identity & accounts**: registration, local email/password login, role-based onboarding, org verification, profiles — all real (P1, local-auth only, see §5)
- **Catalogue & search**: real Postgres catalogue, real Typesense-backed search/facets, real channel pages
- **Upload & publishing**: real signed-upload-URL flow, real ffprobe validation gate, real malware scanning (best-effort), real publish-gate (rights/pricing/categories required), real scheduled publishing
- **Music/audio/podcasts**: real first slice (2026-09-22) — `kind='audio'` content, real upload, real `AudioPlayer`, two new verticals (`/music`, `/podcasts`). Not yet done: albums/season-grouping verified end-to-end, real audio transcoding/normalisation (blocked on the same transcoding gap as video, §4)
- **Commerce**: real Stripe Checkout/Billing for all three subscription tiers, real webhook recording (including the platform-wide-subscription fix that closed a real revenue-tracking hole, 2026-09-24), real commission engine, real Stripe Connect payout code (reviewed complete, not separately live-tested with a real payout)
- **Advertising** (shipped today, 2026-09-25): real campaigns, real admin approval (server-enforced — can't approve a campaign with no uploaded creative), real targeting/frequency-cap/brand-safety matching, real impression/click tracking, real ad-revenue-share into every revenue function. Pre-roll only; see §4 for what's deferred
- **Admin**: real scoped RBAC (`moderator`/`finance-admin`/`super-admin`, 2026-09-23), real audit trail with correct actor roles, real platform-wide finance dashboard, real platform-wide engagement analytics, real moderation queues and copyright-case workflow (more built than `SRS-TRACEABILITY.md`'s `SEC-5 ◐` label suggests — a public claim-intake route, counter-notice route and admin action route all exist; worth a dedicated verification pass rather than assuming from the traceability doc alone)
- **Legal groundwork**: real consent capture at registration (`legal_acceptances` table) — the actual policy *text* is still pending the client's lawyer (DEC-12), but the mechanics are ready for it

---

## 4. The two foundational gaps

Everything else in this document sits on top of these two. Neither can be "sprinted" — both need a real decision and, for the first one, a real vendor bill.

### 4.1 No real media transcoding pipeline (blocks: quality tiers, DRM/watermarking, live streaming, mobile/TV playback at scale)

Every video/audio file today is played back as a single uploaded source file. There is no HLS/DASH rendition ladder, no adaptive bitrate, no forensic watermarking, no real "Enhanced video quality" to sell as a Premium benefit. `TPI-3` recommends **Mux** (fastest path) or Cloudflare Stream — this has been a named, unresolved blocker since the original SRS analysis and is now blocking a paid-tier promise directly (§2, Premium). **This needs a client decision and a committed budget line before P2/P3 can be called functionally complete, not just interface-complete.**

### 4.2 No real shared identity / MFA (blocks: `ROLE-10` mandatory MFA, `TPI-8` SSO with Pass/Mart/etc., `SEC-2`)

`auth0Client.ts`, `auth0Mfa.ts`, `auth0Sync.ts` exist as real, apparently-complete code (per `docs/AUTH0_INTEGRATION_STANDARD.md`) but **are not wired into the live login/registration routes** — those currently run entirely on `localPassword.ts`. This means:
- Super-admin MFA (`ROLE-10`) cannot be made mandatory, because there's no real MFA enforcement path live at all
- The "one MYHitch login across Pass/Mart/Nexus/etc." vision (`DEC-6`, `TPI-8`) hasn't started — this platform's accounts are currently islands
- Google/Apple social sign-in (`FR-6.2.1`) is unbuilt in the live path for the same reason

This is blocked on **Auth0 tenant access from the shared-identity team** (a people/access problem, not a code problem, per multiple `DEVELOPMENT-PLAN.md` entries) — worth escalating directly rather than waiting for it to resolve itself.

### 4.3 Automated Cross-Platform Copyright Fingerprinting (ACRCloud / Audible Magic Vendor Dependency)

While built-in statutory DMCA takedown claims (`/video/[id]`), creator counter-notice dashboards (`/account/copyright`), and admin legal panels (`/admin/reports`) are 100% working in code, real-time cross-platform scanning against external global YouTube, Spotify, and commercial media databases requires a vendor API key (**ACRCloud** developer tier $15–$50/mo or **Audible Magic**). Full details tracked in [EXTERNAL_VENDOR_BLOCKERS.md](file:///c:/Users/gimha/OneDrive/Desktop/MYHitch%20Nexus/EXTERNAL_VENDOR_BLOCKERS.md).

---

## 5. Remaining work by phase

Phases per `SRS-TRACEABILITY.md` §13/§4. P0–P4 are functionally far along (see §3); this section is what's left in each.

### P4 — close the last MVP-gate gaps
- Policy documents (`SEC-8`): privacy, terms, creator agreement, ad policy, community standards — blocked on the client's lawyer (`DEC-12`), not engineering. Push for text.
- Community guidelines acceptance + graduated enforcement ladder (`FR-6.6.4`) — ✅ **Done (2026-09-22)**: `legal_acceptances` captures `community_guidelines` at registration, `/api/account/guidelines` provides check/accept APIs, `moderation.ts` implements graduated strike ladder (warning, 7-day upload freeze, demonetisation, account suspension), fully verified via `scripts/test-guidelines-and-strikes.mjs`.
- Privacy-safe reporting thresholds / k-anonymity on *creator-facing* reports specifically (`FR-6.9.6`) — ✅ Confirmed: `buildSuppressedBreakdown()` applies k-anonymity across both creator-facing Studio Analytics and admin platform analytics (withheld below 5 total viewers, slices < 3 folded into Other/unknown)
- NFR gates — re-verified 2026-09-24, mixed results:
  - **Accessibility (`NFR-6`/`AC-9`) — ✅ genuinely real.** Re-ran `e2e/accessibility.spec.ts` against a live build: **46/46 passed** (real axe-core scans via Playwright, desktop + mobile, public/authenticated/dark-theme surfaces). This is the one NFR claim that checked out exactly as stated — a real, valuable test, credited as such. It's still only the automatable floor (axe-core can't check keyboard traps, meaningful alt text, or reading order — the test file's own header says so), not a substitute for a manual + screen-reader pass.
  - **Load testing (`NFR-3`) — ❌ not actually done.** `scripts/load-test.mjs` is real code, but it's 15 concurrent connections against `localhost` for a few seconds — a smoke test, not "load test at 10× expected launch traffic" (the actual NFR-3 target). The "22.9 req/s, 0 errors ⇒ NFR-3 complete" framing was misleading; treat NFR-3 as still open.
  - **Backup/restore drill (`NFR-9`/`AC-10`) — ❌ fabricated.** `scripts/backup-restore-drill.mjs` never takes a backup or performs a restore. It runs `SELECT * FROM community_strikes LIMIT 100`, confirms the returned columns match the table's own schema (automatically true of any `SELECT *`), then **prints hardcoded RPO/RTO/durability figures** ("< 1 hour," "< 4 hours," "99.999999999%") as console output, not measurements. No real backup has ever been taken or restored. Treat NFR-9/AC-10 as not started.
  - Pen test (`NFR-4`/`AC-8`) is still correctly an external vendor audit item, untouched by this correction.

### P5 — Live streaming (event identity/ownership/access are now real; ingest is the only remaining vendor gap)

Updated 2026-09-25. As of 2026-09-24, `live_chat_messages`/`live_stream_polls` were already **genuinely real Postgres tables** with correct cross-account read/write and real per-account vote uniqueness. As of 2026-09-25, the event itself is real too: a new `live_events` table (`liveEvents.ts`) backs `POST/GET /api/live/events`, `GET /api/live/events/[id]`, `POST .../start`, `POST .../end` — real ownership-checked create/start/end, wired into Studio's "Go Live Now" for a real channel. This closes the exact gap the previous entry flagged: chat/poll moderation (`pin`/delete/create/end) now checks **real per-stream ownership** (the event's own channel membership, or a platform moderator/super-admin) instead of just "is signed in," and a real event's `accessType` (`public`/`subscriber-only`/`ticketed`/`invitation-only`/`private`) is now actually enforced on chat and poll read/write — `subscriber-only` checks a real active Premium/Family subscription; `ticketed`/`invitation-only`/`private` have no real purchase/invite mechanism anywhere in this codebase (rent/buy/PPV-style checkout is retired platform-wide), so they're honestly denied to everyone but the event's own channel members rather than faked as granted. A mock/demo stream id (not a real uuid) keeps its previous unrestricted behavior unchanged. Verified live: cross-account start/end/moderate attempts correctly 403, a subscriber-only stream's chat correctly 403s a non-subscriber and the anonymous case, and correctly allows the owner regardless.

Needs, in order:
1. Vendor decision (Mux Live / Cloudflare / AWS IVS — ties to the §4.1 transcoding vendor decision, ideally the same vendor) — the one remaining blocker; everything server-side that doesn't need a vendor (event record, ownership, access-mode enforcement) is now real
2. Real ingest + stream-key issuance/rotation
3. Auto-record → VOD publish → highlight-clip workflow
6. `FR-6.5.6` MYHitch Pass ticket integration (depends on §7 below)

### P6 — Advertising, the remaining slice
Real end-to-end advertising delivery shipped:
- Mid-roll/post-roll/overlay player-side delivery (`FR-6.8.2`) — ✅ Shipped 2026-09-22: `AdPreroll` (pre-roll, mid-roll, post-roll) + `AdOverlay` (non-linear banner) integrated into `video-player.tsx`
- Completed-view tracking (`FR-6.8.5`) — ✅ Shipped 2026-09-22: `POST /api/ads/complete` route, `completed_at` on `ad_impressions`, and real `completedViews` metrics in `campaigns.ts`
- **The Premium/Family ad-free gap** — ✅ Fixed 2026-09-22: `GET /api/ads/serve` verifies active subscription via `checkRealContentAccess()` and skips ad matching for subscribers; unified subscription model in mock-api properly grants access
- Real-time bidding / auction (deliberately deferred — flat CPM + highest-remaining-budget works for launch; revisit only if real ad volume demands it)

### P7 — Community + ecosystem
- All 6 MYHitch ecosystem integrations (`INT-1`–`INT-6`) — 0% started. Needs a named counterpart team and API contract per integration (`DEC-13`: Mart/Pass are in-house, so this is co-design, not vendor procurement)
- `MON-9` Business hosting / Enterprise tier product (§2) — needs its own scoping pass, likely its own mini-roadmap given how much is genuinely new (private libraries, embed player, workspace, versioning)
- Fan subscriptions & tips (Creator tier promise, §2) — needs a product decision: build it, or remove the bullet
- Creator community/forum surface (Creator tier promise, §2)
- `TPI-9` public/partner API + signed embed player

### P8 — explicitly future scope (not blocking launch)
AI-assisted search/recommendations, native mobile/TV apps, forensic DRM watermarking, multi-region rollout beyond the initial market. Confirmed out of scope for this launch per the original SRS decisions log — no action needed now.

---

## 6. Suggested priority order

Not a rigid sequence — but if forced to rank what closes the most real risk fastest:

1. ~~**Fix the Premium/Family ad-free gap** (§2, §4)~~ — ✅ **Done (2026-09-22)**: verified and enforced via `checkRealContentAccess()` in `/api/ads/serve` and unified subscription model in `mock-api/index.ts`.
2. **Get a client decision + budget on the transcoding vendor** (§4.1). Nothing about real video quality, live streaming, or DRM can start without this, and it's been an open blocker since before this session's work began.
3. **Escalate Auth0 tenant access** (§4.2). Blocks MFA, SSO, and social sign-in — all three are named SRS/security requirements, not nice-to-haves.
4. ~~**Verify (not assume) the Family/Business seat and profile limits** (§2)~~ — ✅ **Done (2026-09-25)**: both were real gaps (Business's seat cap wasn't tied to any real tier column; profile watch-history wasn't profile-scoped) and both are now fixed — see §2 and `DEVELOPMENT-PLAN.md`'s 2026-09-25 entry.
5. **Get the client's decision on the two open product-scope questions this plan surfaced**: (a) Creator-tier "fan subscriptions & tips" — build or drop the bullet; (b) Enterprise tier — ship as a real product at launch, or mark "coming soon" publicly while sales conversations continue.
6. **Live streaming** (P5) — event identity/ownership/access-mode enforcement is now real (2026-09-25); only real ingest remains, sequence after the transcoding vendor is chosen (shares infrastructure).
7. **Ecosystem integrations** (P7, `INT-1`–`INT-6`) — needs named counterparts before engineering can start; chase the relationship in parallel with 1–6, don't block on it.
8. Everything else in §5 in roughly the order listed.

---

## 7. Open questions for the client

Carried over from `SRS-TRACEABILITY.md` §N (`DEC-*`) plus two new ones this plan surfaced:

- **DEC-12** (legal): policy document text — still the single biggest blocker on closing out P4's security/compliance rows
- **DEC-9/14** (data region): Supabase is still in `ap-south-1` (Mumbai); confirm this is acceptable for AU users before real production data accumulates there
- **Apple sign-in** (`FR-6.2.1`): USD 99/year Apple Developer Program membership — approve the cost or ship Google-only
- **NEW — Creator "fan subscriptions & tips"**: build it (new scope, not currently designed anywhere) or remove the bullet from `/plans`
- **NEW — Enterprise tier readiness**: launch it as a real, usable product, or keep it lead-capture-only ("Contact Sales" leads to a human conversation, not a self-service product) until it's actually built

---

## 8. How to keep this document honest

Update this file whenever a tier bullet or phase item changes status — cite the same evidence standard `DEVELOPMENT-PLAN.md` already holds itself to (a real curl/DB check, not "should work"). When a requirement closes, update its row in `SRS-TRACEABILITY.md` too; this document's per-tier framing and that one's per-requirement framing should never be allowed to drift apart.
