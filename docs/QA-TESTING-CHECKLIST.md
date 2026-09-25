# MYHitch Nexus — Full End-to-End QA Checklist

Manual test plan covering every account type, every plan tier, every admin role, and every
cross-cutting feature. Written after the 2026-09-24/25 platform audit that found and fixed
a long list of real bugs — this checklist doubles as a regression suite for that work
(§18 specifically re-tests every fix), not just a feature tour.

Use `- [ ]` boxes as you go; check them off in your editor or on GitHub. Each item names
the exact page/URL and the exact expected result, plus what a **FAIL** looks like where it
isn't obvious.

---

## 0. Before you start

**Two environments, two different capabilities:**

| | Local (`npm run dev`) | Railway staging/production |
|---|---|---|
| Everything except payments | ✅ | ✅ |
| Real Stripe checkout (Premium/Family/Business/tips/memberships) | ❌ — `STRIPE_SECRET_KEY` only exists in Railway's environment | ✅ |

**Any test involving a real card payment must run on the deployed site, not `localhost`.**
Locally, a checkout attempt will honestly 503 ("Payments aren't set up yet") rather than
crash — that 503 itself is correct behaviour locally, not a bug.

**Stripe test card** (test mode only, no real charge): `4242 4242 4242 4242`, any future
expiry date, any 3-digit CVC, any postcode.

**Seeded test accounts** (password for all of them: `AuthzTest123!`). Re-create/reset them
any time with `node --env-file=.env.local scripts/seed-authz-test-accounts.mjs`:

| Email | Role | Notes |
|---|---|---|
| `authz.viewer@nexus.test` | viewer | No channel, no paid plan |
| `authz.creator1@nexus.test` | creator | Owns a real channel |
| `authz.creator2@nexus.test` | creator | A **second**, separate channel — use this to prove creator1 can't touch creator2's stuff |
| `authz.business@nexus.test` | business | Owns a real business channel |
| `authz.moderator@nexus.test` | moderator | Admin tier 1 of 3 |
| `authz.finance@nexus.test` | finance-admin | Admin tier 2 of 3 |
| `authz.admin@nexus.test` | super-admin | Admin tier 3 of 3, full access |

None of these seeded accounts holds a **paid plan** (Premium/Family/Business subscription)
— those have to be bought for real through Stripe checkout (§5/§6/§8) since there's no
seed-data shortcut for real Stripe subscription rows. Budget for creating 2–3 fresh
throwaway accounts during this pass specifically to buy plans with, and cancel/cleanup
afterward.

**Also worth having open while you test:** your browser's dev tools Network tab (to
confirm a "real" claim isn't quietly falling back to a 4xx you didn't notice), and a second
browser profile or incognito window (for every "two different accounts" scenario below).

---

## 1. Anonymous / guest (no sign-in)

- [ ] Home page (`/`) loads, hero + rails render, no console errors
- [ ] `/explore`, `/films`, `/music`, `/podcasts`, `/commercial` (and other verticals) load and filter correctly
- [ ] Search (`/search?q=...`) returns real results with working facets (content type, language, country, access model, age rating)
- [ ] Open a **free** video → plays (or shows an honest "still processing" badge if the master hasn't transcoded — see §0 of `DEVELOPMENT-PLAN.md` on why that's expected, not a bug, until a transcoding vendor is plugged in)
- [ ] Open a video with an **age rating of 18** and **no active profile** → allowed (age-gate only applies once a profile is selected — see §6)
- [ ] Open a **geo-restricted** video from an IP/region it blocks → correctly shows "not available in your region," not the player
- [ ] Try to **like / comment / rate / add to watchlist / follow** while signed out → prompted to sign in; **no** false "success" toast fires first (this was a real bug — a signed-out click used to show a fake success message)
- [ ] Open a **public** live event's chat → can read messages; try posting → works anonymously (matches "public" access mode)
- [ ] Open a **subscriber-only** live event (if one exists) → chat correctly refuses to load with a real 403, not a broken/empty state
- [ ] Send a **tip** to a creator anonymously (small odd amount, e.g. £1.23, on staging with the test card) → succeeds, creator's channel later shows it once the entitlement lands

---

## 2. Registration & authentication — every role

Registration is at `/auth/register`. Role choices: **Viewer, Creator, Business & Advertiser,
Enterprise, Education provider, Government/non-profit**. For each role below, register a
fresh throwaway account (use `+something@` email aliasing so you can reuse one inbox):

- [ ] **Viewer** — Role → Account → Verify (email + mobile OTP) → done. No org step, no MFA step.
- [ ] **Creator** — same steps, no org/MFA step. Confirm a real channel is auto-provisioned (Studio nav appears immediately after registering).
- [ ] **Business & Advertiser** — includes an **Organisation** step (business details/documents) and an **MFA/Security** step. Confirm the org verification flow is reachable afterward at `/business/verification`.
- [ ] **Enterprise** — same extra steps as Business.
- [ ] **Education provider** / **Government/non-profit** — same extra steps; confirm the org `type` shown anywhere in Studio matches what you picked.
- [ ] Email OTP: wrong code rejected, right code accepted, code expires/re-sendable
- [ ] Mobile OTP: same three checks
- [ ] After registering, you're auto-logged-in and land somewhere sensible (not a 404/blank page)
- [ ] **Login**: correct password succeeds; wrong password rejected with a real error (not silently doing nothing)
- [ ] **Login rate limiting**: 6+ wrong passwords in a row on one account → locked out with a real error, even a correct password won't get through until the window clears
- [ ] **Logout**: session actually invalidated server-side (log out, then try re-using an old tab that was still signed in — it should now behave as signed-out on the next real request, not just look logged-in from stale client state)
- [ ] **Password reset** flow completes and the new password actually works

---

## 3. Nexus Free (£0)

Use `authz.viewer@nexus.test` or a fresh Viewer registration — no upgrade needed.

- [ ] Watch a free or ad-supported video, music track, or podcast episode — plays (or honest "processing" state)
- [ ] Ad-supported content shows a **pre-roll ad** before playback (real ad-serving; may legitimately show "no eligible ad" if no campaign is currently targeting this content — that's a correct empty result, not a bug)
- [ ] Premium-only / subscription-gated content shows the **paywall** — cannot be played around
- [ ] Create a **playlist**, add/remove videos from it
- [ ] Add/remove from **watchlist**
- [ ] Follow/unfollow a channel
- [ ] Comment on a video, reply to a comment, like a comment
- [ ] Rate a video (stars)
- [ ] Share a video (copy link / share sheet)
- [ ] Try **Downloads** (`/account/downloads`) → correctly blocked/prompted to upgrade, not silently allowed
- [ ] `/account/subscriptions` correctly shows **no active plan** — not a fake "Active" badge (this was a real bug: a signed-in account with zero subscriptions used to show a false "Active Plan" badge)

---

## 4. Nexus Premium (£9.99/mo or £99/yr) — **staging only, real Stripe**

- [ ] From `/plans`, click **Start Premium** → real Stripe-hosted checkout page opens (not a fake modal)
- [ ] Pay with the test card → redirected back to Nexus, "Payment confirmed" toast, page reflects the unlock within a few seconds
- [ ] `/account/subscriptions` shows the real plan name, **£9.99/month** (or £99/year), and a real renewal date
- [ ] A previously-paywalled Premium video now plays with **no paywall**
- [ ] Ad-supported content that showed ads before now plays **ad-free**
- [ ] **Downloads** now work: download a title, confirm it appears in `/account/downloads`, plays back offline (airplane mode or dev-tools "offline" throttling), remove it again
- [ ] Higher video quality option is available in the player's quality menu (if the title has multiple real quality levels)
- [ ] **Cancel** the subscription from `/account/subscriptions` → shows an "ends on [date]" state, not immediately revoked; confirm access is retained until the period actually ends
- [ ] Confirm the account does **not** also show Family or Business benefits it never paid for (an old bug wrongly showed "Nexus Business Plan is active" for accounts that never subscribed to it)

---

## 5. Nexus Family (£14.99/mo) — **staging only, real Stripe**

Subscribe the same way as Premium (§4), plan = Family.

- [ ] All Premium checks above also hold for a Family subscriber
- [ ] Go to `/account/settings` → **Profiles** section is now unlocked (was correctly gated/blocked as a Free/Premium account)
- [ ] Create up to **5 profiles**; the 6th attempt is correctly refused
- [ ] Give one profile a **PIN** and a maturity rating (e.g. "PG" or "ALL" for a kids profile)
- [ ] `/switch-profile` — switching **into** a PIN-protected profile requires the PIN; wrong PIN rejected, right PIN accepted
- [ ] **PIN brute-force protection**: 6+ wrong PIN attempts in a row → locked out for a few minutes, even the *correct* PIN is refused until the window clears (this was a real, critical bug — the PIN used to be sent to the browser in plaintext and checked client-side, meaning anyone with dev tools could read or bypass it instantly; it's now a real server-side hashed check with rate limiting)
- [ ] **Age-gating, per profile — this is the big one to verify carefully:**
  - [ ] Switch to the kids/PG profile, open an **18-rated** video that's **free or ad-supported** → correctly blocked with an age-gate message, **even though it's free content** (this exact bypass — a kids profile watching adult-rated *free* content — was a real, live security gap fixed 2026-09-25; confirm it stays fixed)
  - [ ] Switch to the adult profile (or no profile) → the same video plays normally
  - [ ] Repeat both checks on a **subscription-gated** 18-rated video (the paid-content age-gate was fixed earlier, 2026-09-24 — confirm it still holds too)
- [ ] **Watch history is now separated per profile** — watch part of a video under the kids profile, then switch to the adult profile: the adult's **Continue Watching** rail must *not* show that video/position, and vice versa (this used to be shared across every profile on the account — fixed 2026-09-25)
- [ ] The video's real **view count** only increments once total for the account across this test, not once per profile you watched it under
- [ ] Family watchlist: a watchlist item added under one profile behaves as expected (confirm current intended scope — account-wide vs. per-profile — matches what's advertised)

---

## 6. Nexus Creator (free to start)

Use `authz.creator1@nexus.test`, or register fresh as Creator.

**Channel & upload**
- [ ] Studio nav appears; `/studio/channel-settings` lets you edit channel name/avatar/banner
- [ ] `/studio/upload` — upload a real small video file. Step through metadata, categories, tags, credits, thumbnails (suggested frames + manual upload), captions, rights (declared owner + ownership confirmation + territory + age rating), pricing (access model: free/ad-supported/subscription), publishing status
- [ ] Try to publish with a **missing required field** (e.g. no category, no ownership confirmation) → server-side rejects it, not just a client-side warning you could bypass via a direct API call
- [ ] Try uploading a **corrupt/non-video file** → real rejection ("isn't a valid, readable video"), not a silently-accepted broken row
- [ ] Publish a video with an **18 rating** or marked **sponsored** → lands in `pending` status, shows up in `/admin/reviews` for a moderator, not immediately live
- [ ] Publish an ordinary video with no flags → goes straight to `published`
- [ ] Repeat the upload flow choosing **Audio** instead of Video (kind toggle) for a music/podcast upload — MP3/WAV accepted, thumbnail step becomes "cover art," audio-description-track option disappears

**Studio tools**
- [ ] `/studio/analytics` shows real views/watch-time/audience breakdowns for your own channel (and *only* your own channel)
- [ ] `/studio/revenue` shows real revenue (ad revenue, tips, subscription-derived) — an honest £0/empty state if nothing's landed yet, not fabricated numbers
- [ ] `/studio/comments` — moderate (hold/remove/restore) comments on your own videos
- [ ] `/studio/sponsorship` — Exchange Hub: create/browse a sponsorship listing, link one of your uploads via the project picker
- [ ] `/studio/magazine` — submit a Magazine article (with or without a linked video)
- [ ] `/studio/playlists` — create/edit a playlist series

**Community, tips, patronage**
- [ ] Post a community update; mark one post **"Patrons only"** — confirm via a second, non-patron account (or logged out) that the patron-only post is correctly **not** visible (this used to be fully public regardless of the badge — fixed)
- [ ] As a fan (different account), send this creator a real tip on staging — confirm it shows up in the creator's tip feed and studio revenue, not stuck in limbo
- [ ] As the creator, try to **tip your own channel** → correctly refused ("Creators cannot tip or support their own channel")
- [ ] Send **11 tips in an hour** to the same channel from one account/IP → the 11th is rate-limited (429), confirming the new tip rate limit

**Live streaming**
- [ ] `/studio/live` → **Go Live Now**: create a real event (title, description, access type: public/subscriber-only/etc.)
- [ ] Start the stream → status flips to "live"; confirm the public live page shows an honest "no real broadcast signal yet" placeholder (not a fake video) alongside **real, working chat and polls**
- [ ] Chat: post as the host — your messages show the **"creator"** badge; post as a different signed-in viewer — shows **"viewer"**
- [ ] From a **second creator's account**, try to start/end *your* stream, or pin/delete a message, or create/end a poll on *your* stream → every one of these correctly 403s ("you don't host/moderate this stream" / "you don't have access") — this is real per-stream ownership enforcement added 2026-09-25; before that, only "signed in" was required, so any creator could moderate anyone's stream
- [ ] Create a **subscriber-only** event → confirm a non-subscribed viewer (and an anonymous visitor) get a real 403 on the chat/poll endpoints, and a real Premium/Family subscriber gets in
- [ ] Create a **ticketed** or **invitation-only** event → confirm it's honestly denied to non-owners (there's no real purchase/invite mechanism behind these two types yet — this is a disclosed, deliberate limitation, not a bug: it should refuse access cleanly, never fake-grant it)
- [ ] End the stream → status flips to "ended"

---

## 7. Nexus Business (£29/mo or £290/yr) — **staging only, real Stripe**

Use `authz.business@nexus.test` or register/upgrade fresh as Business, then subscribe.

- [ ] `/business/channel` — verified business channel setup
- [ ] `/business/verification` — submit org verification with a **garbage** business/ABN-style number → correctly rejected; submit a **real** one → correctly looked up and accepted; then **edit** the number after a successful lookup → submission is correctly re-blocked until it's looked up again (this exact bypass — any garbage value instantly earning a "Verified" badge — was a real, fixed bug)
- [ ] `/business/campaigns` → create a real ad campaign: targeting, budget, CPM, flight dates
- [ ] Upload a real creative (video file + click-through URL) for the campaign
- [ ] Submit for approval → lands in `/admin/ads` for a moderator/admin, not auto-approved
- [ ] As `authz.moderator@nexus.test`, try to **approve a campaign with zero uploaded creatives** → correctly refused (409) — approving used to be possible with nothing behind it
- [ ] Approve a campaign that does have a real creative → status flips to active
- [ ] Confirm the approved campaign's ad actually serves as a pre-roll on a matching ad-supported video (§10 covers the deeper ad-serving checks)
- [ ] `/business/product-links` — add a product/service link, confirm it renders on a linked video's "Shop this" card
- [ ] `/business/leads` — lead capture form works, leads list populates
- [ ] `/business/analytics` — real campaign metrics for your own org only
- [ ] `/business/team` — **seat management**:
  - [ ] Invite up to **5** team members (the default seat cap) — the 6th invite is correctly refused with the real remaining-seat count in the error message
  - [ ] Only the **owner** can invite/remove/revoke — log in as an invited **editor** or **analyst** and confirm they get a real error trying to invite someone or remove the owner (this used to have no role check at all)
  - [ ] Accept an invitation with an account whose email **doesn't match** the invited address → correctly refused
  - [ ] Accept it with the matching account → succeeds, new member appears in the roster
  - [ ] Invite **21 people in an hour** → the 21st is rate-limited (429) — confirms the new invitation rate limit
  - [ ] As `authz.admin@nexus.test` (super-admin), set this org's seat limit to **unlimited** via `PATCH /api/admin/organisations/{id}` with `{"seatLimit": null}` — confirm `/business/team` now shows an "unlimited seats" state (no percentage bar, no "X of Y" cap) and you can now invite past 5
  - [ ] As `authz.moderator@nexus.test` (not super-admin), try the same seat-limit PATCH → correctly refused (403) — only super-admin may change this
  - [ ] Reset the seat limit back to 5 afterward if you don't want it left unlimited

---

## 8. Nexus Enterprise (contact sales)

There's no self-service checkout for Enterprise — it's a real sales lead, closed manually.

- [ ] From `/plans`, **Contact Sales** opens a real lead-capture form; submit it and confirm it's captured somewhere real (not just a toast with nothing behind it)
- [ ] `/business/enterprise` — as a Business-tier org that hasn't been sales-closed as Enterprise yet, confirm Enterprise-only sections are correctly gated/hidden or show an upgrade prompt
- [ ] Once an org's seat limit has been set to unlimited by a super-admin (§7's last steps) *and* whatever other Enterprise flag your team uses to mark a closed deal, re-check `/business/enterprise` for:
  - [ ] Secure media workspace / large file transfer & storage — upload a large real file, confirm it actually stores and can be retrieved
  - [ ] Client review & approval workflow — share a review link, have someone (or a second browser session) leave feedback/approve
  - [ ] Version control & audit trail — confirm past versions/actions are listed and real
  - [ ] Partner API keys (`/api/enterprise/keys`) — generate a key, confirm the scopes you request are **sanitized** (try requesting a scope like `"admin"` — it must be silently dropped, never granted; this was a real critical bug — a client-supplied `"admin"` scope used to work as a superuser bypass on the Partner API)
  - [ ] Call a real Partner API endpoint (`/api/v1/partner/videos`, `/api/v1/partner/embed`) with the generated key — succeeds; with a **revoked** or **garbage** key — correctly 401/403s
  - [ ] Revoke the key, confirm it stops working immediately

---

## 9. Admin — Moderator (`authz.moderator@nexus.test`)

- [ ] Can sign into `/admin` at all
- [ ] `/admin/moderation` and `/admin/reviews` — approve/reject flagged content, videos, comments
- [ ] `/admin/organisations` — view orgs, decide verification (verify/reject) — **cannot** set a seat limit (§7 already covers this 403 check)
- [ ] `/admin/content` copyright-cases actions
- [ ] `/admin/live` — moderate live events/chat platform-wide
- [ ] `/admin/analytics` — can view (all three admin tiers can)
- [ ] `/admin/audit-logs` — sees only **their own** actions, not every admin's
- [ ] **Cannot** access `/admin/finance` (finance-admin/super-admin only) — real 403, not just a hidden nav item (try the URL directly)
- [ ] **Cannot** access `/admin/users` or `/admin/settings` (categories/commissions — super-admin only) — real 403 on direct URL access too

## 10. Admin — Finance-admin (`authz.finance@nexus.test`)

- [ ] `/admin/finance` — real platform revenue summary, revenue-by-stream breakdown (subscriptions, ad revenue, tips, purchases/rentals — all real, no fabricated "Advertising 42%" style numbers), commission rates, organization payout table, revenue trend chart
- [ ] `/admin/analytics` — accessible
- [ ] `/admin/audit-logs` — sees only their own actions
- [ ] `/admin/content` copyright-cases — accessible (same tier set as moderator for this one route)
- [ ] **Cannot** access `/admin/moderation`, `/admin/users`, `/admin/settings` — real 403s on direct URL

## 11. Admin — Super-admin (`authz.admin@nexus.test`)

- [ ] Everything moderator and finance-admin can do, plus:
- [ ] `/admin/users` — search users, change roles, change status. Try saving a role/status change with **no reason entered** → correctly blocked (a reason is required server-side, not just a client-side nicety)
- [ ] `/admin/settings` → Categories: add/edit a real category
- [ ] `/admin/settings` → Commissions: add a new commission rate for a scope (ad_revenue / purchase_rental / membership / ppv), confirm it applies going forward without altering historic transactions' already-recorded splits
- [ ] `/admin/audit-logs` — sees **every** admin's actions, not just their own
- [ ] Set an org's `seat_limit` (§7) — the one action this session added that's deliberately restricted to super-admin even though moderator can otherwise manage organisations

---

## 12. Advertising (cross-tier)

- [ ] Free/ad-supported content genuinely serves a real approved campaign's creative as a pre-roll when one exists and matches targeting (country/language/device/category/age-rating/content-label exclusions) — confirm by checking a campaign's `spend_minor` increases after a real impression
- [ ] A campaign **outside** its country/language/device/category targeting correctly does **not** serve on a mismatched request
- [ ] A campaign with **zero remaining budget** correctly stops serving
- [ ] The same signed-in viewer sees the same campaign **at most** its configured frequency cap within the cap window, then a different (or no) campaign
- [ ] Clicking through a served ad records a real click (`POST /api/ads/click`) and opens the advertiser's click-through URL
- [ ] Premium/Family subscribers never see ads on otherwise-ad-supported content
- [ ] `/admin/ads` shows real campaigns, not mock ones, for a moderator/super-admin

## 13. Search & discovery

- [ ] Search returns results for titles, descriptions, and tags across video/music/podcasts
- [ ] Every listed filter/facet (content type, language, country, access model, age rating, duration, "free only") actually narrows results correctly
- [ ] Sort by relevance/popular/newest/rating/duration each produce a materially different, correctly-ordered result set
- [ ] A brand-new real upload becomes searchable shortly after publishing (search index sync)

## 14. Trust & safety

- [ ] Report a video/comment → appears in `/admin/reviews` or the moderation queue for a moderator to act on
- [ ] Community guideline strikes: trigger enough real violations on a test account to accumulate a strike, confirm the strike ladder's real consequence actually applies (not just a cosmetic counter)
- [ ] Copyright case: file one against a real video, confirm it's actionable from `/admin/content`

---

## 15. Security regression checks — must still hold

Every item below is a real, previously-exploitable bug found and fixed this session.
**These aren't nice-to-haves — they're the specific reason this checklist exists.** If any
of these regress, treat it as a release blocker, not a cosmetic issue.

- [ ] An **anonymous** request to any `/api/business/*` or `/api/enterprise/*` endpoint is refused (401/403) — never silently resolves to "the platform's very first organization ever created" the way it once did
- [ ] A **non-owner** editor/analyst on a business team cannot invite an "owner," remove the real owner, or manage seats
- [ ] A **kids/PG profile** cannot watch an 18-rated **free** video (§5) — confirm both with and without a real Premium/Family subscription in play
- [ ] A request from a **geo-blocked country** cannot watch a geo-restricted video regardless of access model (free or paid)
- [ ] A **non-host** cannot start/end a live stream or moderate its chat/polls, even if they're a creator elsewhere on the platform
- [ ] A **subscriber-only** live event's chat/polls correctly refuse a non-subscriber and an anonymous visitor
- [ ] **Family profile PINs** are never visible in any API response (check the raw `GET /api/account/profiles` response in dev tools — it must show `hasPinSet: true/false`, never the PIN or a hash of it) and can't be brute-forced past 6 attempts / 5 minutes
- [ ] A **Partner API key** requesting scope `"admin"` never receives it, and no endpoint treats that literal string as a superuser bypass
- [ ] A **patron-only** community post is invisible to a non-patron, signed in or not
- [ ] A real tip is never charged to a fan's card without a corresponding completed, visible tip on the creator's side (check `/studio/revenue` and the tip feed after a real staging tip)
- [ ] Rate limits actually trip: >10 tips/hour, >20 invitations/hour, >20 comments/hour, >10 API-key-creations/hour from the same account (or IP, for the anonymous-eligible ones) — the next attempt gets a real 429, and a legitimate request after the window clears succeeds again
- [ ] A moderator cannot reach `/admin/finance`, `/admin/users`, or `/admin/settings`; a finance-admin cannot reach `/admin/moderation` or `/admin/users`; only super-admin reaches `/admin/users`/`/admin/settings` and can set an org's seat limit
- [ ] Watch history/continue-watching for one profile never appears under a different profile on the same account, and the video's real view count isn't inflated by watching under multiple profiles
- [ ] Two different accounts' watch progress, purchases, and subscriptions never bleed into each other (basic tenant isolation — spot-check with `authz.creator1@nexus.test` vs `authz.creator2@nexus.test`)

---

## 16. Sign-off

| Section | Tester | Date | Result | Notes |
|---|---|---|---|---|
| §1 Anonymous | | | ☐ Pass ☐ Fail | |
| §2 Registration & auth | | | ☐ Pass ☐ Fail | |
| §3 Free | | | ☐ Pass ☐ Fail | |
| §4 Premium | | | ☐ Pass ☐ Fail | |
| §5 Family | | | ☐ Pass ☐ Fail | |
| §6 Creator | | | ☐ Pass ☐ Fail | |
| §7 Business | | | ☐ Pass ☐ Fail | |
| §8 Enterprise | | | ☐ Pass ☐ Fail | |
| §9 Admin: Moderator | | | ☐ Pass ☐ Fail | |
| §10 Admin: Finance-admin | | | ☐ Pass ☐ Fail | |
| §11 Admin: Super-admin | | | ☐ Pass ☐ Fail | |
| §12 Advertising | | | ☐ Pass ☐ Fail | |
| §13 Search | | | ☐ Pass ☐ Fail | |
| §14 Trust & safety | | | ☐ Pass ☐ Fail | |
| §15 Security regressions | | | ☐ Pass ☐ Fail | |

Any **Fail** here should be logged with: exact steps, exact account/tier used, actual vs.
expected result, and a screenshot or the raw API response — the same standard this
project's own audits have held fixes to (`docs/DEVELOPMENT-PLAN.md`).
