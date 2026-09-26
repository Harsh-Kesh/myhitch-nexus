// Server-only. Real admin-side approval for Nexus Enterprise applications — Enterprise
// has no self-serve checkout (it's a "Contact Sales" lead, per /plans' own copy), so a
// real registered "producer"-role account stays gated behind organizations.enterprise_status
// until a super-admin activates it here, once an actual deal closes. See the
// 20260930000012 migration's own header, and business/layout.tsx's real gate.
import "server-only";
import { query, queryOne } from "./db";
import { recordAudit } from "./moderation";
import { describeAdminTier } from "./rbac";

export interface EnterpriseApplicationRow {
  id: string;
  name: string;
  country: string | null;
  enterpriseStatus: "pending" | "active" | "rejected" | null;
  enterpriseDecidedAt: string | null;
  enterpriseDecidedByName: string | null;
  enterpriseNotes: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface OrgDbRow {
  id: string;
  name: string;
  country: string | null;
  enterprise_status: "pending" | "active" | "rejected" | null;
  enterprise_decided_at: string | null;
  enterprise_decided_by_name: string | null;
  enterprise_notes: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
}

/** Every real "producer"-type organization — not just pending ones — so an admin can
 * also see who's already active or was rejected, same "one list, filter client-side"
 * shape /admin/organisations already uses for verification. */
export async function listEnterpriseApplications(): Promise<EnterpriseApplicationRow[]> {
  const rows = await query<OrgDbRow>(
    `select
       o.id, o.name, o.country, o.enterprise_status, o.enterprise_decided_at, o.enterprise_notes,
       o.created_at, d.full_name as enterprise_decided_by_name,
       owner.full_name as owner_name, owner.email as owner_email
     from organizations o
     left join accounts d on d.id = o.enterprise_decided_by
     left join lateral (
       select a.full_name, a.email
       from memberships m
       join accounts a on a.id = m.account_id
       where m.organization_id = o.id and m.org_role = 'owner'
       order by m.created_at asc
       limit 1
     ) owner on true
     where o.type = 'producer'
     order by o.created_at desc`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
    enterpriseStatus: row.enterprise_status,
    enterpriseDecidedAt: row.enterprise_decided_at,
    enterpriseDecidedByName: row.enterprise_decided_by_name,
    enterpriseNotes: row.enterprise_notes,
    createdAt: row.created_at,
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

export type DecideEnterpriseResult = { outcome: "success" } | { outcome: "not_found" } | { outcome: "not_enterprise_org" };

export async function decideEnterpriseApplication(
  admin: { id: string; name: string; roles: string[] },
  organizationId: string,
  decision: "active" | "rejected",
  notes: string,
): Promise<DecideEnterpriseResult> {
  const org = await queryOne<{ type: string }>(`select type from organizations where id = $1`, [organizationId]);
  if (!org) return { outcome: "not_found" };
  if (org.type !== "producer") return { outcome: "not_enterprise_org" };

  await query(
    `update organizations
     set enterprise_status = $2, enterprise_decided_at = now(), enterprise_decided_by = $3, enterprise_notes = $4
     where id = $1`,
    [organizationId, decision, admin.id, notes],
  );

  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: describeAdminTier(admin.roles),
    action: `organisation.enterprise_${decision}`,
    targetType: "organisation",
    targetId: organizationId,
    reason: notes,
    severity: decision === "rejected" ? "warning" : "info",
  });
  return { outcome: "success" };
}
