# MYHitch Auth0 Integration Standard

Status: extracted from Pass's real, working implementation (verified against actual
code, not just its original plan doc) — this is the structure every other MYHitch
platform integrating Auth0 should follow, so every platform's auth looks and behaves
identically from the outside and is maintainable the same way internally.

**Reference implementation** (read these, don't reinvent): Pass's
`myhitchpss/AUTH0_INTEGRATION.md` (the original design rationale) and
`myhitchpss/src/lib/server/auth0Client.ts` / `auth0Sync.ts` / `auth0Mfa.ts` (the actual,
working code). This document generalizes that into a platform-agnostic template.

---

## 1. The core principle — headless, never a redirect

Auth0 is used purely as a **headless identity backend**, called only from your own
backend's API routes via Auth0's Authentication API and Management API. The browser
**never** talks to Auth0 directly and never sees an `auth0.com` URL — no Universal
Login, no Lock widget, no redirect. Your platform's existing login/signup UI stays
pixel-identical; only what happens *inside* your auth routes changes.

This is achieved with:
- **Resource Owner Password Grant (ROPG)** for login (server-to-server password check).
- The **Management API** for creating/updating users and MFA enrollment.
- Your **own session mechanism** (bearer token, cookie, whatever your platform already
  uses) issued *by you* after Auth0 confirms identity — Auth0's own tokens are
  discarded immediately and never reach the browser.

**All emails continue to come from your platform's own backend/SMTP — never Auth0's
mailer.** Disable every built-in Auth0 email template (Tenant Settings → Emails) for
your platform's connection.

---

## 2. Required file structure (identical names/roles across every platform)

Three files, same names, same layering, in every platform's server-side lib folder:

| File | Responsibility |
|---|---|
| `auth0Client.ts` | Lowest layer. Just HTTP: `auth0Fetch()` (Authentication API calls), `getManagementToken()` (cached M2M token), `auth0ManagementFetch()` (Management API calls with the token attached). No business logic, no knowledge of your user model. |
| `auth0Sync.ts` | Application-shaped operations built on the above: `createAuth0User()`, `findAuth0UserByEmail()`, `updateAuth0User()`, `changeAuth0Password()`, `verifyAuth0Password()`, `verifyAuth0MfaOtp()`. Maps Auth0's raw error codes (409 conflict, `invalid_grant`, `mfa_required`, attack-protection throttling) into typed results your routes can switch on. Never touches your own database, never issues your session token, never sends email. |
| `auth0Mfa.ts` | TOTP enrollment specifically, kept separate from core identity CRUD: `hasAuth0TotpMethod()`, `getAuth0MfaEnrolled()`, `createAuth0TotpMethod()`. |

No other file in the platform should import anything Auth0-specific — every other
route keeps calling your platform's own `getAuthUser()`-equivalent, unchanged.

---

## 3. Identity storage — Auth0 holds credentials, your own DB holds everything else

- **Auth0 holds**: email, password (hashed by Auth0, never by you), MFA enrollment,
  `email_verified` flag, and a mirrored `app_metadata.role`.
- **Your platform's own database keeps**: role, profile fields, and every relational
  link (orders, org membership, whatever is platform-specific) — exactly as before
  Auth0 was introduced.
- **Link the two** with one additive column: `users.auth0_user_id text unique`.

Do not attempt to make Auth0 the source of truth for anything relational — this is an
additive identity layer on top of your existing schema, not a replacement of it.

---

## 4. Required environment variables (exact names, every platform)

| Variable | Purpose |
|---|---|
| `AUTH0_DOMAIN` | Tenant domain (or custom domain, so no `*.auth0.com` ever leaks to a user) |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Regular Web App used for ROPG login calls |
| `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET` | M2M app used for Management API calls |
| `AUTH0_API_AUDIENCE` | Audience for the Management API M2M token |
| `AUTH0_DB_CONNECTION` | e.g. `Username-Password-Authentication` |

Keeping these names identical across every platform's `.env` is what makes this a real
"structure," not just a similar idea implemented differently each time.

---

## 5. Required route behavior

Whatever your platform's actual route paths are, each of the following must behave
this way:

- **Register/signup**: call `createAuth0User()` (Management API), then insert your own
  profile row with the returned `auth0_user_id`. Your own email-verification flow
  (whatever OTP/link mechanism you already have) stays completely independent of Auth0
  — do not enable Auth0's own verification email.
- **Login**: rate-limit first (your own layer, before Auth0's), then call
  `verifyAuth0Password()`. On `mfa_required`, do not fail the login — return a
  same-origin response telling the frontend to show an MFA step. On success, issue
  *your own* session token exactly as before Auth0 existed; discard Auth0's tokens.
- **Forgot/reset password**: your own OTP/reset-code flow stays exactly as-is for
  verifying the user; only the actual password write becomes a call to
  `changeAuth0Password()` / `updateAuth0User()` instead of a local hash update.
- **Password change (authenticated)**: same substitution as reset — revoke existing
  sessions after, same as before Auth0.
- **Every other route** (profile, logout, "who am I," anything not touching
  credentials): **no changes** — these never call anything Auth0-related.

---

## 6. MFA — TOTP only, deliberately avoiding Auth0-sent email

Recommended, proven approach: **use Auth0 only for password verification and
TOTP/authenticator-app MFA**, never Auth0's email-based MFA factor. TOTP needs no email
at all (the user scans a QR code once, generates codes locally), which sidesteps the
"who sends the MFA email" problem entirely rather than fighting Auth0's email-delivery
pipeline for it.

**Important detail from the real implementation, don't skip this:** generate the TOTP
secret and verify the user's first code **locally** (via your own TOTP library) *before*
telling Auth0 the method exists. Auth0's authentication-methods endpoint marks a
TOTP method as confirmed the instant it's created, with no proof the user actually
possesses the secret — so your own local verification is what actually confirms
enrollment; calling Auth0's create-method endpoint is only the record-keeping step
*after* that.

If a platform later needs SMS/voice MFA, Auth0 supports a custom-provider Action (calls
your own SMS gateway instead of Twilio-via-Auth0) — same "our backend sends it, never
Auth0" pattern, deferred until actually needed.

---

## 7. The one-line summary to hand to whoever's building this

> Auth0 is a locked box that only your backend talks to, for exactly two jobs — "is
> this password right" and "does this TOTP code match" — and everything else (session,
> email, profile data, roles) stays exactly the system your platform already has today.
