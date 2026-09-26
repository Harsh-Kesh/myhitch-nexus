// Server-only. Real admin-side approval for Nexus Enterprise applications — Enterprise
// has no self-serve checkout (it's a "Contact Sales" lead, per /plans' own copy), so a
// real registered "producer"-role account, or an existing Business account requesting an
// upgrade, stays gated until a super-admin here sets a real negotiated price and moves it
// to "awaiting payment." Real access itself is always gated on the resulting Stripe
// subscription actually being paid (see enterprise.ts's hasActiveEnterpriseSubscription()),
// never on anything this file sets directly — see the 20260930000014 migration's header.
import "server-only";
import { query, queryOne } from "./db";
import { recordAudit } from "./moderation";
import { describeAdminTier } from "./rbac";

export interface EnterpriseApplicationRow {
  id: string;
  name: string;
  country: string | null;
  orgType: string;
  /** true for an existing Business (or other) org requesting an upgrade — false for an
   * account that registered as Enterprise directly. Purely a display distinction; the
   * approval action handles both identically. */
  isUpgradeRequest: boolean;
  enterpriseStatus: "pending" | "awaiting_payment" | "active" | "rejected" | null;
  enterprisePriceMinor: number | null;
  enterpriseBillingInterval: "month" | "year" | null;
  enterpriseDecidedAt: string | null;
  enterpriseDecidedByName: string | null;
  enterpriseNotes: string | null;
  createdAt: string;
  ownerAccountId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface OrgDbRow {
  id: string;
  name: string;
  country: string | null;
  type: string;
  enterprise_status: "pending" | "awaiting_payment" | "active" | "rejected" | null;
  enterprise_price_minor: number | null;
  enterprise_billing_interval: "month" | "year" | null;
  enterprise_decided_at: string | null;
  enterprise_decided_by_name: string | null;
  enterprise_notes: string | null;
  created_at: string;
  owner_account_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
}

/** Two real cases in one list: an organization that's already `type = 'producer'`
 * (registered as Enterprise directly), and any organization whose owner has filed a real
 * sales_inquiries lead but whose org is still some other type — an existing Business
 * account asking to upgrade, via /plans' "Talk to sales" while signed in. Both get
 * exactly the same approval action; only the org-type-conversion step differs, handled
 * inside approveEnterpriseApplication() below, not here. */
export async function listEnterpriseApplications(): Promise<EnterpriseApplicationRow[]> {
  const rows = await query<OrgDbRow>(
    `select
       o.id, o.name, o.country, o.type, o.enterprise_status, o.enterprise_price_minor,
       o.enterprise_billing_interval, o.enterprise_decided_at, o.enterprise_notes,
       o.created_at, d.full_name as enterprise_decided_by_name,
       owner.id as owner_account_id, owner.full_name as owner_name, owner.email as owner_email
     from organizations o
     left join accounts d on d.id = o.enterprise_decided_by
     left join lateral (
       select a.id, a.full_name, a.email
       from memberships m
       join accounts a on a.id = m.account_id
       where m.organization_id = o.id and m.org_role = 'owner'
       order by m.created_at asc
       limit 1
     ) owner on true
     where o.type = 'producer'
        or exists (
          select 1 from sales_inquiries si
          where si.account_id = owner.id
        )
     order by o.created_at desc`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
    orgType: row.type,
    isUpgradeRequest: row.type !== "producer",
    enterpriseStatus: row.enterprise_status,
    enterprisePriceMinor: row.enterprise_price_minor,
    enterpriseBillingInterval: row.enterprise_billing_interval,
    enterpriseDecidedAt: row.enterprise_decided_at,
    enterpriseDecidedByName: row.enterprise_decided_by_name,
    enterpriseNotes: row.enterprise_notes,
    createdAt: row.created_at,
    ownerAccountId: row.owner_account_id,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
  }));
}

export interface SalesInquiryRow {
  id: string;
  accountId: string | null;
  fullName: string;
  email: string;
  company: string | null;
  message: string | null;
  createdAt: string;
}

/** Read-only context for the same admin page — a sales inquiry can exist without any
 * real account (an anonymous "Contact Sales" submission from /plans), so this is never
 * assumed to correspond 1:1 with an organization above. */
export async function listSalesInquiries(): Promise<SalesInquiryRow[]> {
  const rows = await query<{
    id: string;
    account_id: string | null;
    full_name: string;
    email: string;
    company: string | null;
    message: string | null;
    created_at: string;
  }>(`select id, account_id, full_name, email, company, message, created_at from sales_inquiries order by created_at desc limit 200`);
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    fullName: row.full_name,
    email: row.email,
    company: row.company,
    message: row.message,
    createdAt: row.created_at,
  }));
}

export type ApproveEnterpriseResult = { outcome: "success" } | { outcome: "not_found" };

/** The one real action that grants a path to Enterprise access — sets the negotiated
 * price/interval a super-admin agreed with the customer, converts the organization to
 * `type = 'producer'` if it wasn't already (the upgrade-from-Business case), grants the
 * owning account the real `producer` role (additive — never removes an existing
 * `business` role, since business/layout.tsx's real gate checks `producer` first and
 * ignores `business` entirely once it's present), and moves to `awaiting_payment`. This
 * does NOT grant access itself — the customer still has to complete a real Stripe
 * subscription for this exact price (see startEnterpriseSubscription()) before
 * hasActiveEnterpriseSubscription() returns true. */
export async function approveEnterpriseApplication(
  admin: { id: string; name: string; roles: string[] },
  organizationId: string,
  priceMinor: number,
  billingInterval: "month" | "year",
  notes: string,
): Promise<ApproveEnterpriseResult> {
  const org = await queryOne<{ id: string }>(`select id from organizations where id = $1`, [organizationId]);
  if (!org) return { outcome: "not_found" };

  await query(
    `update organizations
     set type = 'producer', enterprise_status = 'awaiting_payment',
         enterprise_price_minor = $2, enterprise_billing_interval = $3,
         enterprise_decided_at = now(), enterprise_decided_by = $4, enterprise_notes = $5
     where id = $1`,
    [organizationId, priceMinor, billingInterval, admin.id, notes],
  );

  const owner = await queryOne<{ account_id: string }>(
    `select account_id from memberships where organization_id = $1 and org_role = 'owner' order by created_at asc limit 1`,
    [organizationId],
  );
  if (owner) {
    await query(
      `insert into account_roles (account_id, role, verified) values ($1, 'producer', true)
       on conflict (account_id, role) do nothing`,
      [owner.account_id],
    );
  }

  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: describeAdminTier(admin.roles),
    action: "organisation.enterprise_approved",
    targetType: "organisation",
    targetId: organizationId,
    reason: `${notes} (${(priceMinor / 100).toFixed(2)}/${billingInterval})`.trim(),
    severity: "info",
  });
  return { outcome: "success" };
}

export type RejectEnterpriseResult = { outcome: "success" } | { outcome: "not_found" };

export async function rejectEnterpriseApplication(
  admin: { id: string; name: string; roles: string[] },
  organizationId: string,
  notes: string,
): Promise<RejectEnterpriseResult> {
  const rows = await query<{ id: string }>(
    `update organizations set enterprise_status = 'rejected', enterprise_decided_at = now(), enterprise_decided_by = $2, enterprise_notes = $3
     where id = $1 returning id`,
    [organizationId, admin.id, notes],
  );
  if (rows.length === 0) return { outcome: "not_found" };

  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: describeAdminTier(admin.roles),
    action: "organisation.enterprise_rejected",
    targetType: "organisation",
    targetId: organizationId,
    reason: notes,
    severity: "warning",
  });
  return { outcome: "success" };
}
