// Server-only. Closes a real gap left by local password registration: a newly created
// account had no real channel, so Studio/Business surfaces fell back to the hardcoded
// mock channel id ("ch_mara") for anything that reads store.user.channelId (publishing a
// draft, the "is this my video" entitlement check — see mock-api/index.ts). Every account
// that registers with a role implying a channel now gets a real organizations row plus an
// owner membership, same as a personal YouTube-style channel is just an org with one member.
import "server-only";
import { query } from "./db";
import { pickGradient } from "@/lib/utils";

// Only the DB roles that actually mean "you run a channel/org" provision one. viewer and
// admin have no organization of their own. Keyed on the DB role spelling (post
// toDbRole()) — see rbac.ts; every mock role now has an identical DB spelling.
const ROLE_TO_ORG_TYPE: Partial<Record<string, string>> = {
  creator: "creator",
  business: "business",
  advertiser: "advertiser",
  producer: "producer",
  education: "education",
  // account_roles has one combined "organisation" role where organizations.type still
  // distinguishes government/nonprofit (ChannelKind predates this role) — nonprofit is
  // the more common registrant in practice, so it's the default; an admin can move a
  // specific org to "government" from /admin/organisations if that's wrong.
  organisation: "nonprofit",
};

/**
 * Creates a real channel (organizations row) + owner membership for a freshly registered
 * account, if its role implies one. Returns the new channel id, or null for roles (viewer,
 * admin) that don't get a channel.
 */
export async function provisionChannelForRole(
  accountId: string,
  dbRole: string,
  input: { name: string; country: string | null; email: string },
): Promise<string | null> {
  const orgType = ROLE_TO_ORG_TYPE[dbRole];
  if (!orgType) return null;

  const rows = await query<{ id: string }>(
    `insert into organizations
       (name, type, country, business_email, banner_gradient, avatar_gradient, joined_at)
     values ($1, $2, $3, $4, $5, $6, now())
     returning id`,
    [
      input.name,
      orgType,
      input.country,
      input.email,
      pickGradient(`${accountId}:banner`),
      pickGradient(accountId),
    ],
  );
  const organizationId = rows[0].id;

  await query(
    `insert into memberships (account_id, organization_id, org_role) values ($1, $2, 'owner')`,
    [accountId, organizationId],
  );

  return organizationId;
}
