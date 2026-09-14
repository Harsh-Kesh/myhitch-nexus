// Server-only. Auth0-specific TOTP/MFA operations, built on the same auth0ManagementFetch
// helper auth0Sync.ts uses — kept in its own module per docs/AUTH0_INTEGRATION_STANDARD.md
// §2 so enrollment logic doesn't get mixed into the core identity CRUD in auth0Sync.ts.
// Uses the Management API's Authentication Methods endpoints (create:authentication_methods
// / read:authentication_methods), not the customizable MFA/ROPG flow, which is Early Access
// and unrelated to enrollment. Identical to MYHitch Pass's reference implementation — no
// platform-specific adaptation was needed for this file.
import "server-only";
import { auth0ManagementFetch } from "./auth0Client";

interface Auth0AuthenticationMethod {
  id: string;
  type: string;
}

async function listAuthenticationMethods(auth0UserId: string): Promise<Auth0AuthenticationMethod[]> {
  const res = await auth0ManagementFetch(`/users/${encodeURIComponent(auth0UserId)}/authentication-methods`);
  return (await res.json()) as Auth0AuthenticationMethod[];
}

/** Whether this Auth0 user already has a TOTP authentication method on file. */
export async function hasAuth0TotpMethod(auth0UserId: string): Promise<boolean> {
  const methods = await listAuthenticationMethods(auth0UserId);
  return methods.some((method) => method.type === "totp");
}

/**
 * Reads the backend-authoritative app_metadata.mfa_enrolled marker directly from Auth0
 * (never trust a client-supplied value for this) — used only to detect the inconsistent
 * state where a TOTP method exists but this marker was never set (e.g. a prior enrollment
 * whose method-creation call succeeded but whose follow-up metadata update failed).
 */
export async function getAuth0MfaEnrolled(auth0UserId: string): Promise<boolean> {
  const res = await auth0ManagementFetch(
    `/users/${encodeURIComponent(auth0UserId)}?fields=app_metadata&include_fields=true`,
  );
  const data = (await res.json()) as { app_metadata?: { mfa_enrolled?: boolean } };
  return data.app_metadata?.mfa_enrolled === true;
}

/**
 * Creates a TOTP authentication method for the given Auth0 user, using a secret our
 * backend generated (the Management API requires the caller to supply one — Auth0 does
 * not generate it for this endpoint the way the customizable MFA API's /mfa/associate
 * does). Auth0 marks methods created this way as confirmed immediately, without any
 * proof the caller actually possesses the secret — so this must only ever be called
 * AFTER the caller has independently verified a real TOTP code against this same secret.
 * Never call this as the mechanism that "confirms" enrollment; it's the record-keeping
 * step that follows confirmation.
 */
export async function createAuth0TotpMethod(auth0UserId: string, totpSecret: string): Promise<{ id: string }> {
  const res = await auth0ManagementFetch(`/users/${encodeURIComponent(auth0UserId)}/authentication-methods`, {
    method: "POST",
    body: JSON.stringify({
      type: "totp",
      name: "MYHitch Authenticator",
      totp_secret: totpSecret,
    }),
  });
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

/**
 * Removes every TOTP authentication method on file for this Auth0 user — the disable
 * side of createAuth0TotpMethod() above. Should only be called after the user has
 * re-proven their password (disabling MFA lowers the account's security posture, so it
 * gets the same re-authentication bar as changing a password). Deletes each method
 * individually (the Management API has no bulk-delete for this resource); if one delete
 * fails partway through, the caller should still clear app_metadata.mfa_enrolled since
 * the goal is "MFA no longer enforced at login", not "every method row is gone" — a
 * leftover unconfirmed-looking method with enforcement off is harmless, whereas
 * enforcement staying on with no usable method would lock the user out.
 */
export async function deleteAuth0TotpMethods(auth0UserId: string): Promise<void> {
  const methods = await listAuthenticationMethods(auth0UserId);
  const totpMethods = methods.filter((method) => method.type === "totp");

  for (const method of totpMethods) {
    await auth0ManagementFetch(
      `/users/${encodeURIComponent(auth0UserId)}/authentication-methods/${encodeURIComponent(method.id)}`,
      { method: "DELETE" },
    );
  }
}
