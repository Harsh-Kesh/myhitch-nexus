# MYHitch Nexus — Requirements Inventory (Reverse-Engineered from Frontend Demo)

Source: full crawl of https://senura-d.github.io/myhitch-nexus/ (Next.js static export, mock data only, no backend, no real media/payments/live-ingest/ads). This document is the factual inventory of what the existing frontend implies must be built. `PLAN.md` turns this into an actual build plan.

---

## 1. Roles & account model

Confirmed on `/auth/register/` and `/account/profile/` — **5 roles, additive on one account** (not mutually exclusive), plus an implied Admin surface never exposed in the UI:

| Role | Unlocks | Verification required? |
|---|---|---|
| **Viewer** | Browse/watch/rent/buy/subscribe, household profiles, watchlist, history | No |
| **Creator** | `/studio/*` — own channel, upload, live, playlists, analytics, payouts | No |
| **Business** | `/business/*` — branded org channel, campaigns, product links, leads, billing | Yes |
| **Advertiser** | Buy placements, campaign performance | Yes |
| **Producer/Distributor** | Bulk catalogue import, rights schedules (mentioned at signup, only the CSV/XML bulk-import tab was seen in Studio Upload) | Yes (implied) |
| **Education provider** | Publish accredited courses, issue completion records (mentioned at signup; not a distinct studio surface — reuses Creator Studio + Education content type) | Yes (implied) |
| **Government/Non-profit** | Publish public info/meetings/impact reports (mentioned at signup; reuses Creator Studio + Government/Non-profit content types) | Not stated |
| **Admin** (implied, no UI seen) | Campaign approval queue, content moderation queue (18+/labelled/paid-promotion review), commission-rate configuration, presumably user/org verification | N/A |

One real account (e.g. "Mara Solace") can simultaneously operate a personal Creator channel **and** manage a separate Business org channel ("Helio Motors") — i.e. **account ↔ organisation is a membership relationship**, not 1:1.

**Household profiles**: up to 5 per account, each with a name, avatar, and an age band (adult/teen-12/child-U) that gates playback; profile switching is a distinct concept from role/workspace switching.

---

## 2. Content taxonomy

**11 content types** (used by Upload, Explore, Search facets): Commercial & advertising, Films & cinema, Entertainment, Education, News, Documentary, Events & live, Tourism, Government & community, Non-profit & impact, Creator content.

**15 sub-categories**, each mapped to exactly one content type: Brand films, Product launches, Feature films, Short films, Series & seasons, Music & performance, Courses & lectures, Skills & training, Investigations, News bulletins, Conferences & events, Destinations & places, Public information, Impact & appeals, Creator uploads.

**7 top-nav verticals** (a coarser, marketing-facing grouping): Films & cinema, Commercial, Live, Education, News, Entertainment, Categories(=Explore-all).

## 3. Monetization models (apply per-title or per-event)

1. Free / ad-supported (default, no badge)
2. Rent — fixed price, time-limited entitlement with explicit expiry
3. Buy — one-time, permanent entitlement
4. Platform subscription ("Nexus Premium", £9.99/mo observed: ad-free, included titles, offline downloads, up to 5 profiles)
5. Channel membership (per-creator recurring tier, e.g. "The Ledger — Supporter" £5/mo)
6. Pay-per-view / ticketed event (VOD `£X event`, or live `Ticketed £X`)
7. Sponsored/brand-owned content (`Sponsored` badge + mandatory "Paid promotion · <Brand>" disclosure)
8. Shoppable/affiliate commerce ("Shop this video" — timestamped product cards linked to a fictional "Mart" catalogue, with a per-link commission %, 0% for a business's own products)
9. Territory restriction — an overlay dimension on any of the above ("Availability is limited by territory")

## 4. Core entities and fields

**Title/Video** — id, title, synopsis, thumbnail, content type, sub-category, duration, release date/year, language(s), subtitle tracks, audio tracks, available resolutions (2160p→240p), age rating (U/PG/12/15/18), country of origin, rights holder, licence period (start/end), territories (Worldwide / Selected-only / Worldwide-except-list), content labels (moderation flags), monetisation config (one or more of the 7 models above + prices), view count, rating (avg+count), like count, owning channel, cast & crew (role-typed: Director/Writer/Producer/Cinematographer/Cast), tags/hashtags, comments (threaded 1 level, "Creator" reply badge), related titles, per-viewer state (watchlist bool, entitlement: none/rented+expiry/purchased/subscribed), shoppable product links, publish status (Draft/Private/Unlisted/Scheduled/Published/Archived).

**Channel/Organisation** — id, name, avatar, banner, type (Creator/Business/Government/Education/Non-profit — controlled vocabulary), verified flag, tagline, handle, follower count, video count, total views, join date, description, country, languages, business-contact email, external links, current live stream pointer, viewer's follow state.

**Live Event** — id, title, thumbnail, channel, status (Live/Scheduled/Replay/Ended/Cancelled), scheduled datetime+timezone, access mode (Open/Subscribers-only/Ticketed+price/Private/Invitation-only), chat enabled flag, current+peak watcher counts, description, chat messages (author, role badge host/subscriber, timestamp, text), poll(s), moderation settings, mocked RTMP ingest URL + stream key (reveal/copy/regenerate).

**Playlist** — title, description, visibility (Public/Unlisted/Private), ordered video list, updated date.

**Series** (spec'd, no sample data in demo) — seasons → episodes, "next-episode autoplay."

**Comment** — author, "Creator" badge when it's the video owner replying, timestamp, text, like count, 1-level threaded replies.

**Campaign** (Business/Advertiser) — name, objective (Awareness/Consideration/Traffic/Conversion), status (Draft→Pending approval→Active/Rejected→Paused/Ended — **admin approval is mandatory before delivery**), date range, advertiser, budget (total, daily cap, spend), bid strategy (Automatic / Target CPM / Target cost-per-completed-view / Target cost-per-click), targeting (countries, languages, 7 age bands, interests, content categories, 5 device types, frequency cap), creatives (name, placement format, duration, CTA — ≥1 required, each individually approved), placement formats (pre-roll/mid-roll/post-roll/overlay/sponsored-card), brand safety (excluded content labels, minimum surrounding-content age rating, exclude-UGC toggle), metrics (impressions, completed views, clicks, CTR, conversions, CPM, spend).

**Product Link** (Business) — product name, `mart_<id>` ref, price, commission % (0% for own products), attached video list, clicks, conversions, conversion rate.

**Lead** (Business CRM) — name, company, email, message, source-video attribution, stage (New/Contacted/Qualified/Closed), created date.

**Payout account / Transaction / Commission rule** (Creator revenue) — available-to-withdraw balance, pending-clearance balance (**30-day hold**), lifetime earnings, revenue-by-stream split (Advertising/Rentals&purchases/Memberships/Pay-per-view/Commerce&affiliate), payout method (bank, masked), payout schedule (monthly, 28th, £50 minimum), admin-configured per-stream commission rate (e.g. memberships 85/15 creator/platform), transaction ledger.

**Purchase/Rental/Subscription records** (Account) — purchases: title, type (Rental/Purchase/PPV), amount, status (active/completed/expired/refunded), receipt; rentals: order ref `NX-YYYY-NNNNNN`, expiry; subscriptions: platform tier and/or per-channel memberships, status (active/past-due-with-dunning/cancelled).

## 5. Page-by-page inventory

### Public / viewer
- `/` — hero carousel, Continue watching, Live and upcoming, per-vertical rails, personalized rows.
- `/films/`, `/commercial/`, `/education/`, `/news/`, `/entertainment/` — filterable listing pages. Shared filter sidebar: content sub-category, access & price (8 values), duration (5 buckets), age rating, language + has-subtitles, country of origin, release-year range. Sort: Relevance/Most viewed/Newest/Highest rated/Longest.
- `/live/` — tabs All/Live now/Upcoming/Past & replays, "On air now" hero strip, "Schedule a stream" CTA (creator action).
- `/explore/` — 15-category browser grid + full catalogue filterable grid using the 11-value content-type facet.
- `/search/?q=` — same filters as Explore, matches title/synopsis/tags/cast/transcript.
- `/video/<id>/` — player, ad-disclosure banner (sponsored), forensic watermark overlay (paid content, `NX·<user>·<content>`), entitlement pill ("Rented · expires <date>"), like/watchlist/share/rate/report, "Shop this video" commerce module, tabs About/Comments/Details & rights, related rail.
- `/live/<id>/` — live player, LIVE badge, watcher+peak count, timezone, DVR seek, right panel tabs Chat/Polls/Moderation.
- `/channel/<id>/` — banner/avatar/role-badge/verified/stats/Follow, tabs Videos/Playlists/Live/About, live-now inline banner if applicable.
- `/auth/login/` — email/password, keep-signed-in, Google/Apple OAuth, forgot password.
- `/auth/register/` — 5-step wizard: Role(7 options) → Account(name/email/password+strength meter/mobile/country[12, incl. LK]/language[11, incl. Sinhala/Tamil]/ToS) → Verify → Preferences → Finish.

### Creator Studio (`/studio/*`)
- `/studio/dashboard/` — KPI tiles, 28-day chart, moderation-task alerts, recent uploads w/ status, live-schedule widget.
- `/studio/upload/` — 6-step wizard: Upload(resumable, retry-from-chunk) → Metadata(type/categories/tags/cast/lang/country) → Thumbnails(AI-suggested + custom) → Captions(auto-transcribe/audio-description/manual tracks) → Rights(holder/ownership/licence window/territory/age rating/content labels — **18+ or any label forces admin review**) → Publishing(status/monetisation multiselect/paid-promotion flag[forces review]/commerce link/playlist). Separate Bulk import tab (CSV/TSV/XML against rights schedule).
- `/studio/live/` — schedule modal (title/description/start/timezone/categories/access mode incl. ticketed/chat toggle), encoder settings panel (mocked RTMP URL + stream key).
- `/studio/playlists/` — Playlists tab (CRUD, visibility) + Series tab (spec only, unbuilt).
- `/studio/analytics/` — tabs Overview/Audience/Retention/Revenue; traffic sources, geo/language/device breakdown, retention curve, ad performance (impressions/fill-rate/eCPM).
- `/studio/revenue/` — balances, revenue-stream split, payout settings, commission disclosure, transaction ledger.

### Business (`/business/*`)
- `/business/channel/` — org overview KPIs, recent videos, campaigns/leads/product-links summaries.
- `/business/campaigns/` — filterable list (All/Active/Pending/Paused/Drafts/Rejected), drill-down with delivery charts, targeting/brand-safety recap, per-creative approval.
- `/business/campaigns/new/` — 6-step wizard: Basics → Budget/Bid → Targeting → Creative → Brand safety → Review(submits to **Pending approval**, admin gate). Live "estimated delivery" sidebar.
- `/business/product-links/` — KPIs + table + new-link form.
- `/business/leads/` — 4-stage pipeline board, export.
- `/business/billing/` — Net-30 invoicing, VAT number, invoices table (`NX-ADV-YYYY-NNNN`), credit-approval status.

### Account (`/account/*`)
- `/account/profile/` — household profiles (≤5, age-banded), account details, role badges, verification state.
- `/account/watchlist/`, `/account/purchases/`, `/account/rentals/`, `/account/subscriptions/` — as modeled in §4.
- `/account/settings/` — Appearance(theme), Playback&region (incl. an explicit **geo-restriction simulator** control — prototype-only, drop in real build), Autoplay, Data saver, Privacy (recs/ads personalization/public watchlist), Parental controls (age cap + 4-digit PIN), Security (role-gated MFA — required for advertiser/producer/org roles; signed-in devices w/ remote sign-out), Danger zone (close account).

## 6. Explicit mock/placeholder statements found in the UI (must become real integrations)

- Media playback: "Simulated playback — no media file."
- Upload: "no file leaves your browser."
- Live: "No RTMP or WebRTC ingest exists in this build."
- Commerce: "Commerce links are mocked... linked to Mart."
- Analytics export: "A weekly CSV would be emailed... Mock action, no email is sent."
- Ad performance: simulated, no ad server contacted.
- Payments/refunds/settlement: none anywhere (purchases, rentals, subscriptions, billing all display-only).
- Auth: mock — any email/password logs in; session stored in `sessionStorage` only, does not survive a hard reload/new tab.

## 7. Inconsistencies / open questions found during the crawl

1. **All content requires sign-in in the demo**, even "free" videos — clarify whether the real product should allow anonymous/free viewing.
2. **`/auth/signup/` 404s**; real route is `/auth/register/` — just a demo routing detail, but confirm final URL scheme.
3. Header search (Enter key / search icon) **did not submit** in testing — only direct navigation to `/search/?q=` worked. Verify real form wiring.
4. **Series/episodes** is described in Playlists & Series but has **zero sample data** — episode/season schema needs to be designed from scratch, not reverse-engineered.
5. **Business Studio campaign lists appear to leak other advertisers' campaigns** into a single org's workspace — must confirm intended tenant/account data isolation before building multi-tenant scoping.
6. `/account/rentals/` shows an "active" item bucketed under "Expired & past rentals" — confirms rentals must be status-driven, not statically sectioned.
7. No **Admin console** exists in the frontend at all, yet the data model requires one (campaign approval queue, content moderation queue, commission-rate config, verification approvals). This is a build gap, not just a demo gap — needs its own set of screens.
8. "Mart" (the commerce/product catalogue behind Product Links and Shop-this-video) is explicitly fictional — decide build-vs-integrate (e.g. Shopify/WooCommerce affiliate integration) vs. build a first-party lightweight product catalogue.
9. Forensic watermarking on paid video playback implies a real DRM/watermarking vendor decision (e.g. Mux/Vualto/Verimatrix) — significant infra choice, not incidental.
10. Education content mentions "accredited courses" and "completion records" — clarify whether real accreditation/compliance obligations apply.
