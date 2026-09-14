# MYHitch Nexus — SRS Requirements Traceability Matrix

Source: `MYHitch_Nexus_Web_Development_Requirements.docx` v1.0, July 2026 (22 sections).
Companion: [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md) (how we build it) · [PROTOTYPE-INVENTORY.md](PROTOTYPE-INVENTORY.md) (what the demo contains).

This matrix exists so "everything in the SRS is done" is a **checkable claim**, not a judgement call. Every requirement in the document has an ID, an owner phase, an implementation approach and a verification method. Nothing in §§2–21 is omitted, including items we recommend deferring — those are marked with the phase that covers them.

**Prototype column legend** — the existing Next.js prototype is **UI-only against an in-memory mock API; no requirement below is functionally complete today.** The column rates *interface coverage only*:
- `✅` screen(s) exist and match the requirement
- `◐` partially covered, or covered with a known gap
- `○` no interface exists yet

**Phase key**: P0 Foundations · P1 Identity & Discovery · P2 Media & Publishing · P3 Commerce · P4 Admin/Reporting/Integration/Hardening (**MVP gate**) · P5 Live · P6 Advertising & full monetisation · P7 Community + ecosystem · P8 Future (SRS §17).

---

## A. Headline finding

The prototype is not a rough mockup — it is a **near-complete interface specification of this SRS**. Its 11 admin routes map 1:1 onto the 11 sections of the Administration IA in SRS §9, its 53 routes cover every IA level in §9, and its mock API (`src/lib/mock-api/index.ts`, ~120 typed functions) is explicitly written as a swappable service contract. Its TypeScript types already model 10 of the 11 entities in SRS §10.

Consequence for planning: **the remaining work is ~90% backend, platform and integration engineering**, not UX or UI design. The design deliverables in §19 are largely satisfiable from the existing prototype plus a documented design system. The risk is concentrated in the media pipeline, payments/entitlements, admin enforcement, and the MYHitch ecosystem integrations — none of which exist in any form.

---

## B. §2 Project Objectives

| ID | Objective | Phase | How it is satisfied |
|---|---|---|---|
| OBJ-1 | One central destination for different categories of video/film content | P1 | 11-type taxonomy (§5) in catalogue service; discovery surfaces per vertical |
| OBJ-2 | Creators/businesses/organisations publish, manage, monetise | P2–P3 | Creator Studio + Business Studio backed by real publishing and payout services |
| OBJ-3 | Secure streaming for free, ad-supported, subscription, rental, PPV | P3, P6 | Entitlement service + signed playback tokens; ad insertion in P6 |
| OBJ-4 | Integrate with Mart, Pass, JetNRest, Connect, Lens, Impact | P4 (first), P7 (rest) | Integration gateway; one integration in MVP per §16 |
| OBJ-5 | Strong admin approval, moderation, copyright, advertising, reporting controls | P4 | Admin console with server-enforced RBAC + audit trail |
| OBJ-6 | Analytics and AI-assisted search, accessibility, recommendations, commercial outcomes | P4 (analytics), P8 (AI) | Event pipeline + warehouse; AI features are §17 future scope |
| OBJ-7 | Designed for international expansion, multilingual content, regional compliance | P0 design, P8 rollout | i18n framework and territory model built in from P0; regional launch in P8 |

---

## C. §4 User Types and Permissions — role model

The prototype has **8 roles in its type system and zero access control** (`UserRole` enum; any logged-in user can open `/admin`). The SRS defines **11 user types**. Reconciliation:

| ID | SRS user type | Prototype | Build approach | Phase |
|---|---|---|---|---|
| ROLE-1 | Guest visitor | ✅ | Anonymous browsing allowed; public catalogue endpoints unauthenticated | P1 |
| ROLE-2 | Registered viewer | ✅ | Default role on registration | P1 |
| ROLE-3 | Creator | ✅ | Self-service; unlocks Creator Studio | P2 |
| ROLE-4 | Business / advertiser | ✅ | Requires org verification (§6.2.5) before publishing/campaigns | P2/P6 |
| ROLE-5 | Film producer / distributor | ◐ role exists, no distinct surface | Adds rights/territory/window management + bulk import | P3 |
| ROLE-6 | Education provider | ◐ role exists, no distinct surface | Adds private/learner access controls on collections | P4 |
| ROLE-7 | Government / non-profit | ◐ role exists, no distinct surface | Verified publisher badge + public-information category rights | P2 |
| ROLE-8 | **Moderator / reviewer** | ✅ admin UI exists | Scoped admin role: review queues + content actions only | P4 |
| ROLE-9 | **Finance administrator** | ✅ `/admin/finance` | Scoped admin role: payments, commissions, refunds, payouts, reconciliation | P4 |
| ROLE-10 | **Super administrator** | ✅ `/admin/*` | All modules + settings + audit; MFA mandatory | P4 |
| ROLE-11 | (implicit) Organisation member roles | ◐ memberships table exists | owner/editor/analyst within an organisation | P1 |

**Critical gap**: authorisation is entirely absent. Every role above must be enforced **server-side** on every endpoint, not by hiding navigation. Tracked as SEC-1.

---

## D. §6 Functional Requirements

### §6.1 Public Website and Discovery

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.1.1 | Responsive homepage: featured videos, films, live events, commercial campaigns, personalised sections | ✅ | Rails driven by catalogue + recommendation service; personalisation keyed to profile watch history | P1 |
| FR-6.1.2 | Global nav: Films, Commercial, Live, Education, News, Entertainment, **Creators**, Categories | ◐ **"Creators" destination missing** | Add creator/channel directory page with browse+filter | P1 |
| FR-6.1.3 | Advanced search: keyword, title, creator, business, cast, category, language, country, release year | ◐ UI complete, no index; header submit unreliable | Typesense/Elasticsearch index over content + channels + credits; typo tolerance; fix submit | P1 |
| FR-6.1.4 | Filters: free/premium, duration, age rating, subtitles, language, content type, popularity, release date | ✅ | Facet queries against search index | P1 |
| FR-6.1.5 | Video detail page: title, synopsis, trailer/preview, credits, ratings, language, subtitles, related | ◐ trailer/preview not modelled as a linked asset | Add `trailerAssetId` to content record; related via index similarity | P1 |
| FR-6.1.6 | Channel pages for creators, businesses, film studios, education, government, non-profit | ✅ | Channel service; `ChannelKind` drives badge + capabilities | P1 |
| FR-6.1.7 | Share links and structured social-preview metadata | ◐ share button only | Per-route OpenGraph/Twitter cards + JSON-LD `VideoObject`; SSR required | P1 |

### §6.2 Registration, Identity and Profiles

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.2.1 | Email registration, secure login, password reset, optional social sign-in | ✅ UI (mock: any password works) | Auth0 Universal Login: DB connection + Google/Apple social; hosted password reset | P1 |
| FR-6.2.2 | Role-based onboarding for 7 account types | ✅ 5-step wizard | Post-login provisioning writes `account_roles`; role selection drives verification path | P1 |
| FR-6.2.3 | Email + mobile verification; **MFA for privileged roles**; identity verification where required | ◐ OTP screen hardcoded `000000` | Auth0 email verification + SMS OTP (Twilio); Auth0 MFA policy enforced for admin/finance/advertiser; KYC via Stripe Identity or Sumsub for payout recipients | P1 (verify/MFA), P3 (KYC) |
| FR-6.2.4 | Profile management: name, country, language, notification prefs, parental controls, privacy settings | ✅ | `accounts` + preferences tables; parental PIN hashed (argon2), never returned | P1 |
| FR-6.2.5 | Organisation verification: business details, authorised representative, supporting documents | ✅ `/admin/organisations` UI | Document upload to private bucket; admin review workflow with timeline + decision audit | P2 |
| FR-6.2.6 | Multiple viewer profiles per account, subject to commercial rules | ✅ (≤5, age-banded) | `profiles` table (exists); profile cap enforced by plan entitlement | P1 |

### §6.3 Video Upload and Media Management

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.3.1 | Resumable upload: progress, pause, retry, failure recovery | ✅ simulated chunking + retry | tus-protocol direct-to-storage upload (Mux/Cloudflare direct uploads); resumable across sessions | P2 |
| FR-6.3.2 | Master formats TBC; platform auto-generates streaming renditions | ○ | Publish an accepted-codec/container matrix; provider transcode to HLS/DASH ladder; reject unsupported on probe | P2 |
| FR-6.3.3 | Metadata: title, description, category, tags, participants, production company, release date, language, country | ✅ | Content record service; server-side required-field validation gates publish | P2 |
| FR-6.3.4 | Thumbnail upload + automated suggestions | ✅ (mock confidence scores) | Provider frame extraction at intervals; custom upload with moderation scan | P2 |
| FR-6.3.5 | Subtitle/caption upload, auto-transcription, multi-language tracks, audio description | ✅ UI | WebVTT ingest + validation; auto-transcription (provider/AssemblyAI); AD as alternate audio track | P2 |
| FR-6.3.6 | Draft, private, unlisted, scheduled, published, archived statuses | ✅ | State machine on content record; scheduled publish via job queue | P2 |
| FR-6.3.7 | Playlist, series, season, episode, collection management | ◐ playlists built; **series/seasons UI empty** | `series`/`seasons`/`episodes` schema + ordering; next-episode autoplay | P2 |
| FR-6.3.8 | Rights declaration, ownership confirmation, licence period, permitted countries, age/content classification | ✅ wizard step | `rights_records` table (SRS §10); publish blocked without it; feeds geo + window checks | P2 |
| FR-6.3.9 | Bulk upload and metadata import for approved enterprise/distributor accounts | ✅ CSV/XML tab | Async import jobs, row-level validation against rights schedule, error report download | P3 |

### §6.4 Video Playback and Streaming

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.4.1 | Adaptive bitrate streaming: desktop, mobile, tablet | ◐ simulated player, no media | HLS/DASH via provider + CDN; ABR ladder by source resolution | P1 (free), P3 (paid) |
| FR-6.4.2 | Controls: play/pause, timeline, speed, quality, volume, fullscreen, PiP, casting | ✅ all present in UI | Wire existing player to hls.js/native HLS; Cast + AirPlay where supported | P1 |
| FR-6.4.3 | Caption, subtitle, audio-track selection | ✅ | Track selection from manifest | P1 |
| FR-6.4.4 | Resume watching across devices; watch history | ✅ UI | `watch_progress` server-side, keyed to profile; heartbeat every 10s | P1 |
| FR-6.4.5 | Preview limits for premium films and paid videos | ◐ `previewSeconds` typed | Playback token issues preview-scoped manifest when unentitled | P3 |
| FR-6.4.6 | **Geo-restriction, release-window and entitlement checks before playback** | ◐ simulated country switch | Playback authorisation service: evaluates rights territory + window + entitlement, then mints short-lived signed URL. No signed URL without a pass. | P3 |
| FR-6.4.7 | Watermark / forensic watermark for protected content | ◐ visual overlay mock | Session-based burned-in overlay (MVP) → provider forensic watermarking for premium film tier | P3 (basic), P8 (forensic) |
| FR-6.4.8 | Configurable advertising positions for eligible content | ○ | VAST/VMAP ad breaks (pre/mid/post) configured per content; server-guided insertion | P6 |

### §6.5 Live Streaming

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.5.1 | Schedule live event: title, description, time zone, poster, access rules, pricing | ✅ modal | Live event service; scheduling + timezone-correct display | P5 |
| FR-6.5.2 | Secure stream-key management; approved broadcast inputs | ✅ mock RTMP + key reveal/rotate | Provider live ingest (Mux Live / Cloudflare / AWS IVS); keys stored encrypted, rotatable, never logged | P5 |
| FR-6.5.3 | Public, private, ticketed, subscriber-only, invitation-only | ✅ | Access mode on event → entitlement check at join | P5 |
| FR-6.5.4 | Live chat, moderation, reporting, polls, viewer count | ✅ chat/polls/mod tabs | WebSocket chat service; slow mode, blocked words, timeouts/bans; live concurrency metric | P5 |
| FR-6.5.5 | Automatic recording, replay publishing, highlight creation workflow | ◐ `replayVideoId` typed | Auto-record → VOD asset → optional publish; highlight = clip range job | P5 |
| FR-6.5.6 | **Integration with MYHitch Pass: event ticket grants stream access** | ○ | Pass ticket → entitlement mapping via integration gateway; ticket ID verified at join | P5 (or P4 if Pass is the chosen MVP integration) |

### §6.6 Social and Community Features

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.6.1 | Follow/subscribe channels, likes, ratings, comments, replies, watchlists | ✅ | Engagement service; counters denormalised + reconciled | P1 |
| FR-6.6.2 | Comment moderation, blocked words, creator controls, user reporting | ✅ `/studio/comments` + held state | Blocked-word list (platform + per-channel), auto-hold rules, report → moderation queue | P2 |
| FR-6.6.3 | Notifications: new releases, live events, followed channels, purchases, account activity | ✅ `/account/notifications` | Event-driven notification service: in-app + email + push, per-event preferences | P1 (in-app/email), P5 (push) |
| FR-6.6.4 | Community guidelines acknowledgement and graduated enforcement | ○ | Acceptance recorded at registration + version changes; strike ladder → restriction → suspension, all audited | P4 |

### §6.7 Monetisation and Payments

| ID | Model | Prototype | Build approach | Phase |
|---|---|---|---|---|
| MON-1 | Advertising-supported: pre/mid/post-roll + display, targeting, reporting | ◐ badges only | Ad service + VAST insertion (see FR-6.4.8, §6.8) | P6 |
| MON-2 | Pay-per-view: one-time payment granting defined access | ✅ badges/checkout UI | Stripe Payment Intent → webhook → entitlement (idempotent) | P3 |
| MON-3 | Rental: time-limited entitlement from purchase or first playback | ✅ "expires" pill | Entitlement with `starts_at` policy (purchase vs first-play) + `expires_at`; enforced at token mint | P3 |
| MON-4 | Purchase: long-term access under terms and regional rights | ✅ | Perpetual entitlement, still territory-checked at playback | P3 |
| MON-5 | Channel membership: recurring paid access, where commercially approved | ✅ UI | Stripe Billing subscription per channel tier; admin approval flag on channel | P6 |
| MON-6 | Platform subscription: premium plan for content bundles and benefits | ✅ "Nexus Premium £9.99" | Stripe Billing plan; entitlement resolver treats plan as bundle grant | P6 |
| MON-7 | Sponsored content: clearly labelled, campaign disclosures | ✅ "Paid promotion" banner | `sponsored` flag mandatory when campaign-linked; disclosure rendered non-dismissibly | P3 (label), P6 (campaign link) |
| MON-8 | Affiliate/commerce: trackable links from videos to MYHitch products, travel, services, tickets | ✅ "Shop this video" | Product-link service + click/conversion attribution to Mart/JetNRest/Pass | P4 (Mart), P7 (rest) |
| MON-9 | **Business hosting: paid secure hosting, private libraries, embedded players, enterprise analytics** | ○ | Private library visibility scope + signed embed player + domain allow-list + org analytics | P7 |
| MON-10 | Creator revenue share: configurable commission, earnings, payout thresholds, statements | ✅ `/studio/revenue` (85/15, 30-day hold, £50 min) | Commission engine (admin-configurable per stream), ledger, Stripe Connect payouts, downloadable statements | P3 (ledger), P4 (payouts) |

### §6.8 Advertising Management

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.8.1 | Advertiser onboarding, campaign creation, budget, dates, target audience, creative upload | ✅ 6-step wizard | Campaign service; creative assets through same media pipeline + review | P6 |
| FR-6.8.2 | Formats: video ads, banners, sponsored placement, promoted channels | ◐ 5 placement types typed | Creative type registry; renderers per surface | P6 |
| FR-6.8.3 | Targeting: location, language, age band where lawful, interests, category, device, content context | ✅ | Rule-based targeting evaluated at ad request; lawful-basis gate per jurisdiction | P6 |
| FR-6.8.4 | Frequency caps, brand-safety exclusions, restricted-category controls | ✅ | Per-user frequency counters (Redis); exclusion match against content labels | P6 |
| FR-6.8.5 | Impressions, completed views, click-throughs, conversions, spend reporting | ✅ metrics UI | Ad event stream → warehouse; spend reconciled against budget in near-real-time | P6 |
| FR-6.8.6 | **Administrative approval before advertisements go live** | ✅ `/admin/ads` + Pending state | Campaign + per-creative approval gate; no delivery without approved status | P6 |

### §6.9 Creator and Business Analytics

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.9.1 | Views, unique viewers, watch time, completion rate, retention, traffic sources | ✅ 4-tab analytics | Playback event pipeline → warehouse rollups; retention curve from heartbeat positions | P4 |
| FR-6.9.2 | Audience location, language, device, permitted demographic summaries | ✅ | Derived from privacy-safe event dimensions | P4 |
| FR-6.9.3 | Revenue by content, monetisation method, period, geography | ✅ | Ledger rollups joined to content dimensions | P4 |
| FR-6.9.4 | Ad performance, product/service clicks, conversion tracking | ✅ | Ad + affiliate event streams with attribution windows | P6 |
| FR-6.9.5 | Downloadable reports in common formats + scheduled email reports | ◐ mock CSV toast | Async report jobs → CSV/XLSX to signed URL; scheduled digests via notification service | P4 |
| FR-6.9.6 | **Privacy-safe aggregation and minimum reporting thresholds** | ○ | Suppress cells below k-anonymity threshold; no per-viewer identification in creator-facing reports | P4 |

### §6.10 Administration and Moderation

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| FR-6.10.1 | Dashboard: pending content, reported content, copyright claims, live incidents, account verification | ✅ `/admin` | Queue aggregation with SLA timers and priority | P4 |
| FR-6.10.2 | Actions: approve, reject, request changes, restrict, demonetise, geo-block, age-restrict, suspend, remove | ✅ 9 actions typed | Single moderation-action API; every action writes audit + notifies owner | P4 |
| FR-6.10.3 | User and organisation management, role assignment, account status, verification history | ✅ | Admin user/org service; role grants require super-admin + reason | P4 |
| FR-6.10.4 | Configure categories, content labels, pricing rules, commissions, taxes, currencies, payout rules | ✅ `/admin/settings` config tables | Versioned platform-configuration store with effective dates and change audit | P4 |
| FR-6.10.5 | **Full audit trail of material administrative actions** | ✅ `/admin/audit-logs` | Append-only audit log (actor, role, action, target, reason, IP, severity); tamper-evident, exportable | P4 |
| FR-6.10.6 | Case-management notes and escalation for legal, safety, payment, copyright | ✅ `/admin/reports` cases | Case entity + notes + assignment + escalation states + SLA | P4 |
| FR-6.10.7 | Platform reports: content, users, revenue, advertising, moderation, system usage | ✅ | See RPT-1…8 | P4 |

---

## E. §7 Core User Journeys — end-to-end acceptance flows

Each journey becomes an automated end-to-end test that must pass before its phase closes.

| ID | Journey | Steps | Phase | E2E test |
|---|---|---|---|---|
| UJ-1 | Viewer: discover → detail → auth → pay/free → entitlement → playback → engage → history/receipt | 7 | P3 | `e2e/viewer-journey.spec.ts` |
| UJ-2 | Creator publishing: register/verify → upload → metadata+rights+monetisation → processing → review → publish/schedule → monitor | 7 | P4 | `e2e/creator-publish.spec.ts` |
| UJ-3 | Film rental: distributor creates title+rights → sets territory/classification/window/price → admin verifies terms → customer rents → playback checks account/territory/device/entitlement → revenue+commission recorded | 6 | P4 | `e2e/film-rental.spec.ts` |
| UJ-4 | Commercial video: business verifies org → uploads + links products → chooses organic/paid/campaign → compliance+brand-safety review → distributed to audiences and MYHitch modules → reviews reach/clicks/conversions | 6 | P6 | `e2e/commercial-journey.spec.ts` |

---

## F. §8 MYHitch Ecosystem Integrations

No integration of any kind exists today. §16 requires **one** in MVP (preferably Pass or Mart).

| ID | Platform | Required integration | Phase | Dependency |
|---|---|---|---|---|
| INT-1 | **MYHitch Mart** | Attach product videos to listings; video→product links, demos, reviews, **purchase attribution** | P4 (if chosen) | Mart product + order API, shared attribution ID |
| INT-2 | **MYHitch Pass** | Promote events, sell access, stream ticketed events, post-event recordings | P4/P5 (if chosen) | Pass ticket API + entitlement mapping |
| INT-3 | MYHitch JetNRest | Hotel/destination/airline/travel videos with booking links | P7 | JetNRest inventory + deep links |
| INT-4 | MYHitch Connect | Verified business/professional-service videos on provider profiles | P7 | Connect profile API, embed contract |
| INT-5 | MYHitch Lens | Embed/cross-publish news interviews, reports, documentaries | P7 | Lens content sync (bidirectional?) |
| INT-6 | MYHitch Impact | Fundraising stories, project updates, donor reports | P7 | Impact campaign API |

**Resolved (DEC-13, 2026-09-14)**: Mart and Pass are built in-house, so this is a co-design exercise rather than a dependency on external documentation — we specify the contract, their team builds to it. Still needs a named counterpart and a delivery slot agreed before P4.

---

## G. §10 Data and Content Model

| ID | Entity | Prototype types | Build |
|---|---|---|---|
| DM-1 | User — identity, role, status, verification, preferences, consent, security | ✅ `User` | `accounts` (built P0) + `account_roles` + `consents` + `security_settings` |
| DM-2 | Organisation — legal/trading name, country, category, representatives, verification | ✅ `Organisation` | `organizations` (built P0) + `org_representatives` + `org_documents` |
| DM-3 | Channel — owner, branding, description, followers, visibility, monetisation status | ✅ `Channel` | `channels` (1:1 or n:1 with organisation) |
| DM-4 | Video asset — master, renditions, duration, resolution, captions, audio tracks, processing status | ◐ merged into `Video` | **Split**: `media_assets` (technical) vs `content_records` (editorial) |
| DM-5 | Content record — title, synopsis, category, tags, cast/credits, rating, language, territory, publication status | ✅ `Video` | `content_records` + `credits` + `content_categories` |
| DM-6 | Rights record — owner, licence type, territories, start/end, evidence, restrictions | ✅ `VideoRights` | `rights_records` + evidence documents in private bucket |
| DM-7 | Entitlement — user/account, content, purchase type, validity, device rules, playback status | ✅ `Entitlement` | `entitlements`, sole source of truth for playback authorisation |
| DM-8 | Transaction — customer, amount, currency, tax, gateway ref, status, refund, invoice | ✅ `PurchaseRecord` | `transactions` + `invoices` + `refunds`, reconciled to Stripe |
| DM-9 | Campaign — advertiser, budget, target, dates, creative, placement, status, performance | ✅ `Campaign` | `campaigns` + `creatives` + `campaign_targeting` |
| DM-10 | Moderation case — reporter, content, reason, evidence, decision, action, reviewer, timestamps | ✅ `ModerationItem`/`AdminCase` | `moderation_cases` + `case_notes` + `moderation_actions` |
| DM-11 | Analytics event — view, impression, watch duration, click, conversion, device, privacy-safe location | ✅ analytics types | Event stream → warehouse; raw events never exposed to creators |

---

## H. §11 Non-Functional Requirements

| ID | Area | Target we will hold ourselves to | Verification | Phase |
|---|---|---|---|---|
| NFR-1 | Performance | LCP < 2.5s p75 on catalogue pages; search p95 < 300ms; video start < 2s p75 | Lighthouse CI + k6 load tests | P4 |
| NFR-2 | Availability | 99.9% monthly for playback path; health checks; documented recovery runbooks | Uptime monitoring + game-day test | P4 |
| NFR-3 | Scalability | Horizontal API scaling; CDN-fronted delivery; queue-based media jobs; partitioned event store | Load test at 10× expected launch traffic | P4 |
| NFR-4 | Security | TLS everywhere, AES-256 at rest, least privilege, secrets manager, audit logging | Pen test + dependency scan before launch | P4 |
| NFR-5 | Privacy | Consent management, privacy settings, retention schedule, DSAR export/delete | Privacy review + DSAR drill | P4 |
| NFR-6 | Accessibility | **WCAG 2.2 AA** on core journeys | axe-core in CI + manual audit + assistive-tech pass (AC-9) | P4 |
| NFR-7 | Compatibility | Current Chrome/Edge/Safari/Firefox desktop + iOS/Android mobile; responsive | Cross-browser matrix in Playwright | P4 |
| NFR-8 | Observability | Centralised logs, metrics, error tracking, alerting, tracing across services | Alert-fires-correctly test | P0/P4 |
| NFR-9 | Backup & recovery | Documented backups, tested restore, stated RPO/RTO, media durability | Quarterly restore drill, first before launch | P4 |
| NFR-10 | Maintainability | Modular services, documented APIs (OpenAPI), coding standards, automated tests, CI/CD | Coverage gate + API docs published | P0 onward |

---

## I. §12 Security, Safety and Governance

| ID | Requirement | Prototype | Build approach | Phase |
|---|---|---|---|---|
| SEC-1 | **RBAC separating viewer, creator, business, moderator, finance, administrator** | ○ **none — any user can open `/admin`** | Server-side authorisation on every endpoint + Next.js middleware; deny-by-default; permission tests per role | P1 (core), P4 (admin) |
| SEC-2 | MFA for administrative and high-risk accounts | ◐ toggle in UI | Auth0 MFA policy, mandatory for admin/finance/advertiser; step-up on sensitive actions | P1 |
| SEC-3 | Payments via compliant third-party gateway; **no raw card data stored** | ○ | Stripe hosted Checkout/Elements; PCI SAQ-A scope; card data never touches our servers | P3 |
| SEC-4 | Upload scanning, file validation, malware protection, processing isolation | ○ | Magic-byte + codec probe, AV scan (ClamAV/provider), sandboxed transcode workers, quarantine bucket | P2 |
| SEC-5 | **Copyright notice-and-action, counter-notice, repeat-infringer controls** | ◐ claims appear in admin queue | Public claim intake form → case → takedown/restore workflow with statutory timers; strike counter with escalation | P4 |
| SEC-6 | Content classifications, age gates, parental controls, restricted-content handling | ✅ UI | Age rating on content + profile age band + parental PIN enforced server-side at playback | P3 |
| SEC-7 | Reporting channels for harmful, illegal, misleading, infringing content | ◐ report buttons | Report intake → triage queue → SLA'd moderation; reporter feedback loop | P4 |
| SEC-8 | Policy documents: privacy, terms, creator agreement, advertising policy, community standards, film-distribution terms | ○ footer links only | Versioned policy documents with acceptance tracking per user and per version | P4 (legal-owned, DEC-12) |
| SEC-9 | Audit logs for privileged access, moderation, payment changes, account actions | ✅ UI | Append-only audit store, immutable retention, exportable for compliance | P4 |
| SEC-10 | Incident response, breach management, business continuity procedures | ○ | Documented runbooks, on-call rota, breach notification playbook, tested annually | P4 |

**Immediate security action (not in SRS, found during audit)**: the live Supabase `service_role` key and database password currently sit in plaintext in `.env.local` on a developer machine and were shared over chat during setup. **Rotate both, and move all secrets to a managed secrets store before any wider team access.** Tracked as SEC-11.

---

## J. §14 Third-Party Integrations

| ID | Service | Recommendation | Phase |
|---|---|---|---|
| TPI-1 | Payment gateway (cards + digital methods) | **Stripe** (Payments, Billing, Connect, Tax, Invoicing) | P3 |
| TPI-2 | Email / SMS / push providers | Postmark or SendGrid (email), Twilio (SMS), Web Push | P1 |
| TPI-3 | Object storage, transcoding, CDN, optional DRM | **Mux** (fastest path) or Cloudflare Stream; AWS MediaConvert+IVS+CloudFront if unit economics demand control | P2 |
| TPI-4 | Identity verification for creators/orgs/payout recipients | Stripe Identity (bundled) or Sumsub | P3 |
| TPI-5 | Analytics + consent management | Self-hosted event pipeline + warehouse; CMP for cookie/consent | P4 |
| TPI-6 | Advertising measurement and campaign services | In-house first; evaluate Kevel/GAM at scale | P6 |
| TPI-7 | Tax, currency, invoicing for multi-country | Stripe Tax + Invoicing; local advice for AU GST | P3 |
| TPI-8 | **MYHitch SSO and shared account/profile services** | Auth0 as shared MYHitch identity tenant — **subject to DEC-6** | P1 |
| TPI-9 | Documented public/partner APIs for enterprise publishing and embedded playback | OpenAPI-documented partner API + signed embed player | P7 |

---

## K. §15 Reporting Requirements

| ID | Report | Primary users | Source | Phase |
|---|---|---|---|---|
| RPT-1 | Content performance | Creators, businesses, admins | Playback events | P4 |
| RPT-2 | Audience and retention | Creators, producers, marketers, admins | Heartbeat events | P4 |
| RPT-3 | Revenue and commission | Creators, finance, admins | Ledger | P4 |
| RPT-4 | Sales, rentals, subscriptions | Finance, commercial, content owners | Transactions | P4 |
| RPT-5 | Advertising campaign performance | Advertisers, business users, commercial admins | Ad events | P6 |
| RPT-6 | Copyright and moderation | Moderators, legal/compliance, senior admins | Cases + audit | P4 |
| RPT-7 | Platform growth (users, active viewers, content, watch time, transactions, retention) | Management | Warehouse | P4 |
| RPT-8 | System operations (uptime, errors, playback failures, processing queues, performance) | Technical team | Observability stack | P4 |

---

## L. §18 Acceptance Criteria — the MVP definition of done

These are the contractual gates. Each has a named verification method and evidence artefact.

| ID | Area | Minimum standard | How we prove it |
|---|---|---|---|
| AC-1 | Account | Register, verify, sign in, recover access, manage profile/preferences securely | E2E suite + Auth0 logs; negative tests for lockout/reset abuse |
| AC-2 | Upload | Authorised users upload supported files and see reliable processing status | E2E upload of each supported format; induced-failure recovery test |
| AC-3 | Publishing | **Content cannot become public until all required metadata, rights and approval steps are complete** | Server-side gate test: direct API attempts to publish incomplete content must fail (not just UI validation) |
| AC-4 | Playback | Entitled users stream responsively with captions and adaptive quality | Playback QoE metrics + caption rendering test across browser matrix |
| AC-5 | Commerce | Payments create accurate entitlements, receipts, transaction records; **failures do not grant access** | Stripe test-mode matrix incl. declines, timeouts, duplicate webhooks; ledger reconciliation report |
| AC-6 | Administration | Authorised staff can review, approve, reject, restrict and audit content and users | Role-permission matrix test; audit completeness check |
| AC-7 | Analytics | Views and commercial events captured consistently, shown in role-appropriate reports | Event-count reconciliation: player events vs warehouse vs report UI |
| AC-8 | Security | Critical security tests, access-control checks, dependency reviews pass before release | Pen-test report, RBAC test suite green, SCA scan clean of criticals |
| AC-9 | Accessibility | Core journeys meet agreed **WCAG 2.2 AA** checklist | axe-core CI + manual audit report + screen-reader walkthrough of UJ-1/UJ-2 |
| AC-10 | Operations | Monitoring, alerts, backups, restore procedure, deployment rollback documented and tested | Runbooks + evidence of a live restore drill and a rollback drill |

---

## M. §19 Development Deliverables

| ID | Deliverable | Status | Owner |
|---|---|---|---|
| DEL-1 | Approved product requirements and prioritised backlog | **This document + DEVELOPMENT-PLAN** → needs client sign-off | Product |
| DEL-2 | UX flows, wireframes, high-fidelity responsive designs | Largely satisfied by the prototype (53 routes); gaps: Creators directory, series/seasons, copyright workflow | Design |
| DEL-3 | Design system and reusable components | Partially exists (`components/ui`, 15 primitives + tokens); needs documentation + Storybook | Frontend |
| DEL-4 | Solution architecture, data model, API specification, security design | To produce: OpenAPI spec (mock-api's ~120 functions are the draft contract), threat model | Architecture |
| DEL-5 | Configured dev, test, staging, production environments | Production only (Railway); need dev/test/staging separation | DevOps |
| DEL-6 | Front-end, back-end, media pipeline, admin portal, integration components | Frontend UI only | Engineering |
| DEL-7 | Automated tests, manual test cases, accessibility and security test results | Playwright scaffold exists (2 specs) | QA |
| DEL-8 | Data-migration / initial content-loading tools | Bulk import (FR-6.3.9) doubles as this | Engineering |
| DEL-9 | Administrator, creator and business user guides | Not started | Product/Docs |
| DEL-10 | Deployment, monitoring, backup, recovery, operational documentation | Not started | DevOps |
| DEL-11 | Post-launch defect resolution and warranty/support period | Contractual — needs agreed terms | Commercial |

---

## N. §20 Decisions Required Before Final Estimation

Firm estimates and several design choices are blocked until these are answered. Our recommendation is given for each so the decision is a yes/no, not an essay.

**Status 2026-09-14: all fourteen resolved.** This table is kept as the original analysis; see [DEVELOPMENT-PLAN.md §0](DEVELOPMENT-PLAN.md#0-decisions-log-20) for the actual answers, which in three cases (DEC-5 live streaming, DEC-9/14 data region, DEC-13 integrations) differ from what's recommended below.

| ID | Decision | Our recommendation | Blocks |
|---|---|---|---|
| DEC-1 | Launch markets: Australia only or international; countries/languages | AU-first, architected multi-region; ship English, keep i18n scaffolding | Tax, currency, territory rules, CDN regions |
| DEC-2 | Initial content: which categories and partners at launch | 2–3 categories with committed partners beats 11 empty ones | Catalogue seeding, IA emphasis |
| DEC-3 | Monetisation active in MVP + commission structure | MVP: free + PPV + rental only (matches §16); commission configurable, default 85/15 | P3 scope, ledger design |
| DEC-4 | Film protection: DRM level, device limits, download rules, territorial restrictions | Signed URLs + visible watermark for MVP; Widevine/FairPlay only if distributors demand | TPI-3 vendor choice and cost |
| DEC-5 | Live streaming: MVP or later; expected concurrency | **Later (P5)** — §16 omits it and it doubles MVP infrastructure risk | P5 timing, vendor choice |
| DEC-6 | MYHitch identity: shared login with main MYHitch platform or separate | Auth0 tenant designed as the shared MYHitch identity provider now; cheaper than migrating later | TPI-8, all auth work |
| DEC-7 | Payments and payouts: provider, currencies, tax, creator payout process | Stripe + Connect, AUD primary, Stripe Tax; monthly payouts, £/A$50 threshold, 30-day hold | P3/P4 |
| DEC-8 | Moderation: internal team, hours, escalation, SLAs | Internal team, business hours, 24h SLA standard / 4h for illegal-content reports | P4 staffing, queue SLA timers |
| DEC-9 | Hosting: cloud, data-region, budget | Currently Railway + Supabase (ap-south-1). **Data-residency for AU users needs confirming** — likely move to AU region | Infrastructure, compliance |
| DEC-10 | Applications: web-only or parallel mobile/smart-TV | Web-only for MVP; §17 defers native apps | Scope |
| DEC-11 | Branding: final logo, palette, typography, direction | Prototype's system is coherent — formalise it as the design system | DEL-3 |
| DEC-12 | Legal: responsible adviser and approval process for policies/licences/distribution terms | Client-side legal owner needed; we build the mechanics, not the wording | SEC-8, launch |
| **DEC-13** | *(added by us)* **MYHitch ecosystem APIs** — do Mart/Pass/etc. have documented APIs, auth model and environments we can integrate against? | Need Pass **or** Mart API access before P4 | INT-1/INT-2 and the §16 MVP integration requirement |
| **DEC-14** | *(added by us)* **Supabase data region is currently ap-south-1 (Mumbai)** — acceptable for AU users and AU privacy expectations? | Recommend recreating in an AU region before real data exists | DEC-9, NFR-5 |

---

## O. §21 Success Measures — instrumentation plan

Each measure must be emitted as an event or derivable from the ledger from day one; retrofitting analytics is the usual way these go missing.

| ID | Measure | Instrumented by |
|---|---|---|
| KPI-1 | Registered viewers, verified creators, verified organisations | Identity + verification events |
| KPI-2 | Monthly active viewers, returning-viewer rate | Session events, warehouse cohorting |
| KPI-3 | Hours watched, average watch time, completion rate | Playback heartbeats |
| KPI-4 | Approved videos, films, channels, live events | Publishing + moderation events |
| KPI-5 | Gross transaction value, platform revenue, payouts | Ledger |
| KPI-6 | Advertising fill, completed-view rate, conversion rate | Ad events (P6) |
| KPI-7 | Upload processing success, video start time, playback failure rate, uptime | Media pipeline + QoE + observability |
| KPI-8 | Moderation response time, copyright resolution time, support satisfaction | Case SLA timers |
| KPI-9 | Cross-platform conversions to Mart, Pass, JetNRest, Connect, Lens, Impact | Attributed affiliate/integration events |

---

## P. Coverage summary

| SRS section | Items | UI exists | Functionally built | Phase span |
|---|---|---|---|---|
| §6.1 Discovery | 7 | 4 full, 3 partial | 0 | P1 |
| §6.2 Identity | 6 | 5 full, 1 partial | 0 (schema only) | P1–P3 |
| §6.3 Upload/media | 9 | 6 full, 2 partial, 1 none | 0 | P2–P3 |
| §6.4 Playback | 8 | 3 full, 4 partial, 1 none | 0 | P1–P3 |
| §6.5 Live | 6 | 4 full, 1 partial, 1 none | 0 | P5 |
| §6.6 Social | 4 | 3 full, 1 none | 0 | P1–P4 |
| §6.7 Monetisation | 10 | 7 full, 2 partial, 1 none | 0 | P3–P7 |
| §6.8 Advertising | 6 | 5 full, 1 partial | 0 | P6 |
| §6.9 Analytics | 6 | 4 full, 1 partial, 1 none | 0 | P4–P6 |
| §6.10 Admin | 7 | 7 full | 0 | P4 |
| §12 Security | 10 | 3 partial, 7 none | 0 | P1–P4 |
| §8 Integrations | 6 | 0 | 0 | P4, P7 |

**69 functional requirements. 48 have a working interface. 0 are functionally complete.** The prototype is an excellent specification and a poor product — which is exactly the right starting position, provided nobody mistakes it for a working system.
