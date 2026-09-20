# Creator guide

Covers Creator Studio (`/studio/*`). For what's real vs. simulated across the whole platform, see `docs/DEVELOPMENT-PLAN.md`.

## Getting started

Register with the **Creator** role (or add it to an existing account from Account → Settings) to get a real channel provisioned automatically. Studio is only fully real once you have your own channel — the shared demo account (`mara@marasolace.example`) has no channel of its own, so actions taken while signed in as it don't persist past that browser session. Register your own account to publish anything that should actually stick around.

## Dashboard (`/studio/dashboard`)

Your channel at a glance: views, watch time, unique viewers and estimated revenue over the last 28 days, a daily trend chart, your top-performing videos, and your most recent uploads with their real status (Draft / Pending review / Published).

## Uploading a video (`/studio/upload`)

A six-step wizard: Upload, Metadata, Thumbnail, Captions, Rights, Publishing.

1. **Upload** — choose a real file. For a real channel this is a genuine upload to storage with real progress; it's resumable if your connection drops.
2. **Metadata** — title and category are required before you can continue; the server enforces this too, not just the button being disabled.
3. **Thumbnail** — pick a suggested frame or upload your own image. Suggested frames are AI-labelled but the confidence scores shown are illustrative — no real vision model has scanned your footage yet.
4. **Captions** — auto-transcription is simulated; upload your own `.vtt` file if you need real captions today.
5. **Rights** — declare the rights holder and confirm ownership. Both are required; publishing is blocked without them.
6. **Publishing** — choose how the video is accessed (free, ad-supported, rent, buy, pay-per-view, subscription-included, or channel-membership-only) and publish.

A video marked 18+ or as paid promotion lands in **Pending review** instead of going live immediately — that's the real moderation gate working as intended, not a delay you need to work around.

### What happens after you publish

The row, its metadata, rights record and pricing are all real and immediately visible in **Content**. Playback itself depends on real video transcoding (a separate, not-yet-connected vendor) — until that's live, the player shows an honest "still processing" state rather than a broken video. Everything else about the page (title, synopsis, credits, rights, comments, ratings, and — if you set a price — real purchase/rental/subscription checkout) works today regardless.

## Content (`/studio/content`)

Your full video list with real status, views, completion rate and comment count. From the actions menu you can change status (draft/private/unlisted/published/archived — real) or view the video/its analytics. **Edit details** is not built yet — to change a title or other metadata today, you'd need to publish a corrected version; the menu says so rather than pretending to save a change it can't make.

## Comments (`/studio/comments`)

Comments containing a link are automatically held for review. Approve or remove them here — both are real, and removing hides the comment from the public page immediately.

## Analytics (`/studio/analytics`)

Four tabs (Overview, Audience, Retention, Revenue) with a date-range selector. All figures are computed from real playback and revenue events for your channel — genuinely zero until real viewers watch or pay for something. Country/device/language breakdowns only appear once a range has enough real viewers to protect individual privacy; a small range showing nothing there is expected, not a bug. Both Analytics and Revenue have a working **Export CSV**.

## Revenue (`/studio/revenue`)

Shows your real available balance, pending clearance, lifetime earnings and a transaction ledger, broken down by revenue stream (advertising, rentals/purchases, memberships, pay-per-view, commerce/affiliate). The platform's commission is applied per stream (configured by admins in Settings → Commissions) and never changes retroactively for past transactions.

To withdraw, connect a real bank account via **Stripe Connect** — this redirects to Stripe's own onboarding, and MYHitch Nexus never collects or stores your bank details itself. Once connected and verified, **Withdraw** sends your available balance for real.

## Magazine and Exchange Hub

Both let you link one of your own uploads into a cross-platform placement. You need at least one real, published video first — until then, there's nothing of yours to link.
