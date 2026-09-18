# Pass ↔ Nexus shared-auth integration — open questions

Status: **paused**, pending answers below. Not being worked on until these are resolved.

Context: reviewed the `business_account` repo (https://github.com/Harsh-Kesh/business_account) and its live login at https://businessauth.myhitch.com.au/login on 2026-09-17, at the user's request, to figure out how to wire Nexus's role selection / business onboarding into it. Full findings are in the chat history for that date; this file exists so the questions survive independently of that conversation.

## What the review found, in brief

- The repo is Pass's own app (`package.json` name: `myhitch-pass-app`), not a separate shared auth service — despite the `businessauth.myhitch.com.au` domain name suggesting otherwise.
- It uses Auth0, but via **dedicated per-environment tenants** (`myhitch-dev/stg/prod`, custom domain `auth.myhitch.com.au`), explicitly documented in its own architecture doc as "never shared."
- Nexus's own `docs/AUTH0_INTEGRATION_STANDARD.md` assumes a **single shared tenant** (`dev-o2y17tinf55ifhk3.us.auth0.com`) — the same one referenced in this doc's §9 blocker #2, currently being built out by another team member.
- **These are two different tenants.** Nothing in the Pass repo references the shared tenant Nexus is waiting on.
- No real cross-platform identity handoff exists today: no exposed JWT, no shared-domain cookie (session cookie is `__Host-` prefixed, origin-scoped), no webhook, no service-to-service API. The only working cross-platform primitive is a `returnTo`/`site` redirect allow-list — but Pass forces a user through its **own full 9-step onboarding wizard** before honoring the return redirect.
- The "Nexus" entry in Pass's onboarding "Platforms" step is a stored checkbox with no functional logic behind it today.
- Pass's own business-identity fields (ABN, entity type, authorised person) are regex/format-validated only — no real ABR lookup. Nexus's own ABN Lookup work (built 2026-09-17, see the dev plan) is more rigorous on that specific point. Stripe Connect (used by Pass for banking/payout KYC) is a separate concern and doesn't overlap with either.
- The live login page is generic/unbranded ("Login Form", "powered by Auth0") — no per-platform theming exists in the code, so redirecting Nexus users there today would drop them on an unbranded page mid-flow.

## Questions that need an answer before any wiring work starts

1. **Is the tenant mismatch known?** Does whoever owns Auth0 across the org (the client, or whoever is coordinating the shared-tenant build-out referenced in blocker #2) know Pass and Nexus are on two different tenants? Is that intentional, or does it need reconciling first?
2. **Which integration shape is actually intended?**
   - (a) Nexus fully redirects business users to Pass for login *and* onboarding, and only gets them back once Pass's own review is done — simplest, but Nexus loses all UX control over business onboarding, and Nexus's own just-built ABN/verification flow becomes redundant; or
   - (b) a real shared backend/API gets built that both platforms' own UIs call independently — more correct long-term, but that API doesn't exist yet in the Pass repo today (would be new scope, not "wiring").
3. **If (a):** should Nexus's own business-verification work (ABN Lookup, document upload, declaration — built 2026-09-17) be kept as an additional/parallel check, scrapped in favour of Pass's, or merged into one system?
4. **Who owns building the missing plumbing** (whichever shape is chosen) — a shared session/token handoff, a webhook, or a real API — since none of it exists in the Pass repo today?
5. **Does the "Nexus" checkbox in Pass's onboarding wizard need to start doing something**, and if so, what — is that a change to the Pass repo, which would need coordinating with whoever maintains it?

## Once these are resolved

Still open from earlier in this engagement, deferred until the above lands:
- Which Nexus roles actually need this business-auth flow. Business/advertiser are the clear yes. Producer/education/organisation are still an open call. Viewer/creator don't need business verification and would log in via whatever the eventual shared mechanism turns out to be, regardless of shape (a) or (b) above.
- Real email verification at registration — separately deferred per the user's own instruction, unrelated to this integration but adjacent (both touch the registration/login flow).
