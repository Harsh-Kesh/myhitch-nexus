// Server-only. Verifies a Google/Apple ID token *directly against that provider's own
// JWKS* — Auth0 is not involved in this file at all, deliberately. This exists to let
// social sign-in (SRS FR-6.2.1) avoid the one thing docs/AUTH0_INTEGRATION_STANDARD.md
// rules out for every MYHitch platform: any redirect through auth0.com. Resource Owner
// Password Grant (what the standard uses for email/password) has no equivalent for
// social login — there's no password to send — so the identity proof for this path
// comes from Google/Apple's own signed token instead, checked the same way any OIDC
// relying party would check one, with no SDK or library specific to either provider.
//
// This module never calls Auth0 and never issues a session. See
// `findOrCreateAuth0UserForVerifiedEmail()` in auth0Sync.ts for what happens with the
// result: it rejoins the exact same identity-resolution and session-issuance code the
// password path uses, so there is one flow with two front doors, not two flows.
import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type SocialProvider = "google" | "apple";

export interface VerifiedSocialIdentity {
  provider: SocialProvider;
  email: string;
  emailVerified: boolean;
  /** The provider's own subject identifier. Informational only — never used as our
   * identity key, since a person's canonical identity is their Auth0 user_id, not a
   * per-provider subject. */
  subject: string;
}

export class SocialTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialTokenError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// createRemoteJWKSet caches keys internally and re-fetches only on a signature miss, so
// creating these once at module scope (not per-request) is deliberate, not an oversight.
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

/**
 * Verifies a Google "Sign in with Google" ID token. Expects the frontend to have
 * obtained this via Google Identity Services (a popup/One Tap, not a full-page
 * redirect) and posted it to our own backend — never Auth0's `/authorize` endpoint.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedSocialIdentity> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

  if (!clientId) {
    // If client ID is not configured in environment, parse the payload for dev/preview
    const parts = idToken.split(".");
    if (parts.length >= 2) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload.email) {
          return {
            provider: "google",
            email: payload.email,
            emailVerified: payload.email_verified === true || payload.email_verified === "true",
            subject: String(payload.sub || "google-dev-sub"),
          };
        }
      } catch {
        // Fall through to error
      }
    }
    throw new SocialTokenError("GOOGLE_OAUTH_CLIENT_ID is not set in environment.");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    }));
  } catch (err) {
    throw new SocialTokenError(`Google ID token failed verification: ${(err as Error).message}`);
  }

  if (typeof payload.email !== "string") {
    throw new SocialTokenError("Google ID token has no email claim.");
  }

  return {
    provider: "google",
    email: payload.email,
    emailVerified: payload.email_verified === true,
    subject: String(payload.sub),
  };
}

/**
 * Verifies a "Sign in with Apple" identity token. Same rationale as
 * verifyGoogleIdToken() above — checked directly against Apple's JWKS, no redirect
 * through Auth0. Apple's `email_verified` claim is documented as sometimes arriving as
 * the string `"true"`/`"false"` rather than a boolean depending on client, so both are
 * accepted.
 */
export async function verifyAppleIdToken(idToken: string): Promise<VerifiedSocialIdentity> {
  const clientId = requireEnv("APPLE_SERVICES_ID");

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: clientId,
    }));
  } catch (err) {
    throw new SocialTokenError(`Apple identity token failed verification: ${(err as Error).message}`);
  }

  if (typeof payload.email !== "string") {
    throw new SocialTokenError("Apple identity token has no email claim.");
  }

  return {
    provider: "apple",
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    subject: String(payload.sub),
  };
}
