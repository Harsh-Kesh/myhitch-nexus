// Server-only. Closes a real gap left by local password registration: a newly created
// account had no real channel, so Studio/Business surfaces fell back to the hardcoded
// mock channel id ("ch_mara") for anything that reads store.user.channelId (publishing a
// draft, the "is this my video" entitlement check — see mock-api/index.ts). Every account
// that registers with a role implying a channel now gets a real organizations row plus an
// owner membership, same as a personal YouTube-style channel is just an org with one member.
import "server-only";
import { query } from "./db";
import { pickGradient } from "@/lib/utils";

import { lookupAbn } from "./abnLookup";

// Only the DB roles that actually mean "you run a channel/org" provision one. viewer and
// admin have no organization of their own. Keyed on the DB role spelling (post
// toDbRole()) — see rbac.ts; every mock role now has an identical DB spelling.
const ROLE_TO_ORG_TYPE: Partial<Record<string, string>> = {
  creator: "creator",
  business: "business",
  advertiser: "business",
  // Both the "enterprise" self-registration role and the "producer" spelling now map to
  // the real DB role "producer" (see rbac.ts's MOCK_TO_DB_ROLE) — this key is keyed on
  // that post-toDbRole() spelling, so only "producer" is ever actually looked up here.
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
  input: { name: string; country: string | null; email: string; orgName?: string; abn?: string; acn?: string; industry?: string },
): Promise<string | null> {
  const orgType = ROLE_TO_ORG_TYPE[dbRole];
  if (!orgType) return null;

  let finalOrgType = orgType;
  if (dbRole === 'business' || dbRole === 'producer' || dbRole === 'advertiser') {
    if (["film-studio", "news", "education", "government", "nonprofit"].includes(input.industry || "")) {
      finalOrgType = input.industry;
    }
  }

  // A business/enterprise registrant's own name and their company's name are two
  // different things (the registration wizard's "Organisation" step collects orgName
  // separately) — falls back to the personal name for roles that never collect one.
  const orgName = input.orgName?.trim() || input.name;

  // Nexus Enterprise has no self-serve checkout — registering with this role creates the
  // account and organization for real, but full Enterprise Hub access stays behind a real
  // pending/active/rejected gate a super-admin decides once an actual sales deal closes
  // (see business/layout.tsx and admin/enterprise/page.tsx). Every other org type has no
  // such gate at provisioning time — enterprise_status stays null for them, meaning "not
  // applicable," not "pending."
  const enterpriseStatus = orgType === "producer" ? "pending" : null;

  const isBusinessOrEnterprise = dbRole === "business" || dbRole === "producer" || dbRole === "advertiser";
  const isEducationOrOrg = dbRole === "education" || dbRole === "organisation";

  let verificationStatus = isBusinessOrEnterprise ? "verified" : "unverified";
  let abnLookupStatus: string | null = null;
  let abnLookupEntityName: string | null = null;

  if (isEducationOrOrg) {
    if (!input.abn || !input.abn.trim()) {
      verificationStatus = "rejected";
      abnLookupStatus = "ABN is required for verification.";
    } else {
      try {
        const result = await lookupAbn(input.abn);
        if (result.found && result.abnStatus === "Active") {
          verificationStatus = "verified";
          abnLookupStatus = "verified_via_abn";
          abnLookupEntityName = result.entityName;
        } else {
          verificationStatus = "rejected";
          abnLookupStatus = result.message || "ABN is not active or not found.";
        }
      } catch (err) {
        verificationStatus = "rejected";
        abnLookupStatus = err instanceof Error ? err.message : "ABN lookup service failed.";
      }
    }
  }

  const rows = await query<{ id: string }>(
    `insert into organizations
       (name, type, country, business_email, banner_gradient, avatar_gradient, joined_at, enterprise_status, verification_status)
     values ($1, $2, $3, $4, $5, $6, now(), $7, $8)
     returning id`,
    [
      orgName,
      finalOrgType,
      input.country,
      input.email,
      pickGradient(`${accountId}:banner`),
      pickGradient(accountId),
      enterpriseStatus,
      verificationStatus,
    ],
  );
  const organizationId = rows[0].id;

  await query(
    `insert into memberships (account_id, organization_id, org_role) values ($1, $2, 'owner')`,
    [accountId, organizationId],
  );

  if (isBusinessOrEnterprise || isEducationOrOrg) {
    await query(
      `insert into organization_verification (organization_id, legal_entity_name, abn, acn, country_of_registration, submitted_at, abn_lookup_status, abn_lookup_entity_name, abn_lookup_checked_at)
       values ($1, $2, $3, $4, $5, now(), $6, $7, $8)`,
      [
        organizationId,
        orgName,
        input.abn?.trim() || null,
        input.acn?.trim() || null,
        input.country ?? "AU",
        abnLookupStatus,
        abnLookupEntityName,
        isEducationOrOrg ? new Date().toISOString() : null,
      ],
    );
  }

  return organizationId;
}
