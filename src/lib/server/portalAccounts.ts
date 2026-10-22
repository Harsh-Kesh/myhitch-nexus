// Server-only. Where a Nexus channel is paid when a customer pays from their MYHitch
// Wallet: the Stripe connected account the MYHitch Business Portal created for the
// business (the Portal's Stripe platform also holds the wallet's money, so the hub can
// Transfer the business its share). Nexus never creates or stores that account — it's
// read live from the Portal's own database, the same lookup MYHitch Pass uses
// (organizerStripeAccount.ts / portalDb.ts there):
//
//   Nexus channel (organizations) -> its owner's accounts.auth0_user_id (set when the
//   business signs in through the Portal, /api/hub/session/) -> Portal profiles
//   (auth0_user_id) -> Portal stripe_accounts (profile_id).stripe_account_id
//
// Nexus's own payout_accounts (Connect Express accounts on Nexus's Stripe platform, for
// card-sale withdrawals) are a different Stripe platform and can't receive a Transfer
// from the Portal's, so they're deliberately not used here.
//
// Needs PORTAL_SUPABASE_URL + PORTAL_SUPABASE_SERVICE_ROLE_KEY (the Portal project's
// service-role key — server-only). Selects the account id and its status flags only,
// never bank details.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { queryOne } from "./db";

export type PortalAccountMissing =
  /** PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_ROLE_KEY aren't set. */
  | "not_configured"
  /** No owner of the channel signed in through the Portal (no auth0_user_id). */
  | "unlinked"
  | "no_portal_profile"
  | "no_portal_stripe_account"
  /** The Portal account exists but Stripe hasn't enabled it yet (onboarding unfinished). */
  | "not_enabled"
  /** The Portal database couldn't be read — callers must fail closed. */
  | "portal_unavailable";

export type PortalConnectedAccount =
  | { found: true; accountId: string }
  | { found: false; reason: PortalAccountMissing };

let portalClient: SupabaseClient | null = null;

function getPortalDb(): SupabaseClient | null {
  if (portalClient) return portalClient;
  const url = process.env.PORTAL_SUPABASE_URL;
  const key = process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  portalClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return portalClient;
}

/** The Business Portal connected account (acct_...) that sells `organizationId`'s videos,
 * or why there isn't one. */
export async function resolvePortalConnectedAccount(organizationId: string): Promise<PortalConnectedAccount> {
  const missing = (reason: PortalAccountMissing): PortalConnectedAccount => ({ found: false, reason });

  // The channel's first owner with a MYHitch (Auth0) identity — the business itself.
  const owner = await queryOne<{ auth0_user_id: string }>(
    `select a.auth0_user_id from memberships m
     join accounts a on a.id = m.account_id
     where m.organization_id = $1 and m.org_role = 'owner' and a.auth0_user_id is not null
     order by m.created_at asc
     limit 1`,
    [organizationId],
  );
  if (!owner) return missing("unlinked");

  const portal = getPortalDb();
  if (!portal) return missing("not_configured");

  const { data: profile, error: profileError } = await portal
    .from("profiles")
    .select("id")
    .eq("auth0_user_id", owner.auth0_user_id)
    .maybeSingle();
  if (profileError) {
    console.error("[portalAccounts] Portal profile lookup failed; failing closed", { code: profileError.code });
    return missing("portal_unavailable");
  }
  if (!profile) return missing("no_portal_profile");

  const { data: account, error } = await portal
    .from("stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("profile_id", (profile as { id: string }).id)
    .maybeSingle();
  if (error) {
    console.error("[portalAccounts] Portal Stripe account lookup failed; failing closed", { code: error.code });
    return missing("portal_unavailable");
  }
  const row = account as { stripe_account_id: string | null; charges_enabled: boolean | null } | null;
  if (!row?.stripe_account_id || !/^acct_[A-Za-z0-9]+$/.test(row.stripe_account_id)) {
    return missing("no_portal_stripe_account");
  }
  // Same gate Pass uses before sending a business money: Stripe has enabled the account.
  if (row.charges_enabled !== true) return missing("not_enabled");
  return { found: true, accountId: row.stripe_account_id };
}
