# MYHitch Nexus — External Vendor Blockers & Production Budget Requirements

This document tracks all **external vendor dependencies, service contracts, and budget requirements** needed to convert the MYHitch Nexus platform from local/staging environment into a 100% production-ready enterprise deployment.

---

## 📌 Summary Table of Vendor Blockers

| # | Domain / Feature | Recommended Vendor(s) | Estimated Cost / Tier | Status in Codebase |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Cross-Platform Copyright Fingerprinting** | **ACRCloud** / **Audible Magic** | $15–$50/mo (ACRCloud) or $500+/mo (Audible Magic) | 🟡 API Hooks Built; In-house DMCA Takedown Live; Blocked on Vendor API Key |
| **2** | **VOD Media Transcoding & HLS/DRM** | **Mux** / **Cloudflare Stream** | Usage-based (~$0.005/min transcoding) | 🟡 Upload UI & Master Storage Live; Blocked on Transcoding Vendor Account |
| **3** | **Live Streaming Ingest & Distribution** | **Mux Live** / **AWS IVS** | Usage-based (~$0.001/min live) | 🟡 Live Studio UI & Polls Live; Blocked on RTMP Live Vendor Ingest |
| **4** | **Enterprise Identity, SSO & MFA** | **Auth0** (Okta) | Startup / Enterprise tier | 🟡 Auth0 Modules Built; Blocked on Shared Identity Tenant Credentials |
| **5** | **Automated Content Moderation (AI Safety)** | **AWS Rekognition** / **Sightengine** | Usage-based per image/video scan | 🟡 In-House Moderation Queue Live; Blocked on AI Classifier Vendor API |
| **6** | **Creator Payout KYC & Business Verification** | **Stripe Connect** | Usage-based per payout | 🟢 ABN Lookup Live; Stripe Connect Payout Backend Built |
| **7** | **Apple Social Sign-In** | **Apple Developer Program** | $99 / year | 🟡 Google Social Auth Live; Blocked on Apple Developer Account |

---

## 🔍 Detailed Vendor Blocker Breakdown

---

### 1. Cross-Platform Copyright Fingerprinting & Piracy Prevention
* **SRS / Feature Requirement**: Prevent unauthorized uploading of copyrighted videos, music, TV shows, or movies ripped from external platforms (YouTube, Spotify, Netflix, TikTok, Apple Music).
* **Vendor Options**:
  * **ACRCloud (Recommended for Launch)**: Covers 100M+ commercial tracks, YouTube fingerprints, Spotify releases, TV, and film. (~$15–$50/month developer tier).
  * **Audible Magic**: Industry standard enterprise fingerprinting engine used by Twitch, Vimeo, and SoundCloud (~$500+/month).
* **Current Codebase Status**:
  * **Live**: Built-in statutory DMCA Notice-and-Takedown system (`src/lib/server/copyright.ts`), Rightsholder Takedown Modal on watch pages (`/video/[id]`), Creator Dispute Dashboard (`/account/copyright`), and Admin Compliance Panel (`/admin/reports`).
  * **Blocker**: Automated real-time scanning against global YouTube/Spotify catalogs requires setting `ACRCLOUD_ACCESS_KEY` & `ACRCLOUD_SECRET_KEY` in environment variables.

---

### 2. VOD Media Transcoding, HLS Rendition Ladder & DRM
* **SRS / Feature Requirement**: Transcode raw video uploads (MP4, MOV) into adaptive bitrate HLS/DASH streams (1080p, 4K HDR), forensic watermarking, and signed playback tokens.
* **Vendor Options**:
  * **Mux** (Confirmed candidate in architecture plan) or **Cloudflare Stream** / **AWS MediaConvert**.
* **Current Codebase Status**:
  * **Live**: Raw master file upload to Supabase Storage, size validation, and HTML5 video playback.
  * **Blocker**: Transcoding ladder and dynamic bitrate switching require a Mux or Cloudflare Stream API Access Token.

---

### 3. Live Streaming RTMP Ingest & WebSockets
* **SRS / Feature Requirement**: Real-time RTMP stream key generation, stream ingestion, low-latency live playback, and WebSocket chat infrastructure.
* **Vendor Options**:
  * **Mux Live**, **AWS IVS** (Interactive Video Service), or **Cloudflare Stream Live**.
* **Current Codebase Status**:
  * **Live**: Live Studio UI (`/studio/live`), stream key reveal, chat moderation, pinned messages, and live audience polls.
  * **Blocker**: Real live broadcast ingestion requires credentials from Mux Live or AWS IVS.

---

### 4. Enterprise Single Sign-On (SSO) & Multi-Factor Authentication (MFA)
* **SRS / Feature Requirement**: Cross-ecosystem login (Pass, Mart, Nexus), mandatory Super-Admin MFA (`ROLE-10`), and Google/Apple social sign-in.
* **Vendor**: **Auth0** (Okta).
* **Current Codebase Status**:
  * **Live**: Local password authentication, session management, and Redis rate-limiting. Auth0 integration files (`auth0Client.ts`, `auth0Mfa.ts`, `auth0Sync.ts`) are built.
  * **Blocker**: Requires client provisioning of the shared Auth0 enterprise tenant.

---

### 5. Automated AI Content Moderation & Safety Classifier
* **SRS / Feature Requirement**: Proactive automated scanning of uploaded imagery and video frames for adult content, violence, and CSAM compliance.
* **Vendor Options**:
  * **AWS Rekognition Image/Video** or **Sightengine** (or PhotoDNA/Google CSAI Match for CSAM).
* **Current Codebase Status**:
  * **Live**: In-house moderation queue (`/admin/reviews`), ClamAV antivirus file scanner, keyword hold rules, and creator strike ladder.
  * **Blocker**: Automated AI visual classification is deferred pending client budget approval.

---

### 6. Apple Developer Program Account
* **SRS / Feature Requirement**: Support for Apple Social Sign-In (`FR-6.2.1`).
* **Vendor**: **Apple Developer Program** ($99/year).
* **Current Codebase Status**:
  * **Live**: Google Social Auth routes configured (`/api/auth/social/google`).
  * **Blocker**: Apple Client ID and Secret key require an active Apple Developer Team Subscription.

---

## 🛠️ Action Items for Client & Production Team

1. **Copyright Fingerprinting**: Subscribe to **ACRCloud** developer tier ($15/mo) and add `ACRCLOUD_ACCESS_KEY` to Railway.
2. **Video Transcoding**: Sign up for **Mux** account and populate `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.
3. **Auth0 Tenant**: Obtain Auth0 tenant domain and client keys from identity team.
4. **Apple Sign-In**: Approve $99/year Apple Developer membership.
