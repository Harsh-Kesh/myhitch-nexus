// Server-only. Real admin-side counterpart to organizationVerification.ts (the
// creator-facing submission side) — /admin/organisations has read/actioned nothing but
// in-memory mock data since this project began, even though organizations,
// organization_verification and organization_documents are all already real (see
// docs/DEVELOPMENT-PLAN.md's 2026-09-17 entries).
import "server-only";
import { query } from "./db";
import { createDocumentUrl } from "./storage";
import { recordAudit } from "./moderation";

// organizations.type's real values (creator/business/government/education/non_profit,
// plus advertiser/producer per 20260915000002) mapped to the mock's ChannelKind labels —
// a display-only mapping, never a source of truth for the type itself.
const ORG_TYPE_TO_CHANNEL_KIND: Record<string, string> = {
  creator: "creator",
  business: "business",
  government: "government",
  education: "education",
  non_profit: "nonprofit",
  advertiser: "business",
  producer: "film-studio",
};

export interface AdminOrganisationRow {
  id: string;
  name: string;
  kind: string;
  registrationNumber: string;
  country: string;
  representative: string;
  representativeEmail: string;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  submittedAt: string;
  documents: Array<{ id: string; name: string; type: string; status: "received"; uploadedAt: string }>;
  timeline: Array<{ id: string; label: string; at: string; actor: string; state: "done" | "current" | "pending" | "failed" }>;
  channelId?: string;
}

interface OrgDbRow {
  id: string;
  name: string;
  type: string;
  country: string | null;
  verification_status: AdminOrganisationRow["verificationStatus"];
  created_at: string;
  abn: string | null;
  authorised_person_name: string | null;
  contact_full_name: string | null;
  contact_email: string | null;
  submitted_at: string | null;
  verification_decided_at: string | null;
  verification_decided_by_name: string | null;
}

/** Only organisations that have actually started verification — an organisation that
 * never touched the flow has nothing for an admin to review, and showing every seeded/
 * signed-up org here (most with no verification row at all) would just be noise. */
export async function listAdminOrganisations(): Promise<AdminOrganisationRow[]> {
  const rows = await query<OrgDbRow>(
    `select
       o.id, o.name, o.type, o.country, o.verification_status, o.created_at,
       o.verification_decided_at, d.full_name as verification_decided_by_name,
       v.abn, v.authorised_person_name, v.contact_full_name, v.contact_email, v.submitted_at
     from organizations o
     join organization_verification v on v.organization_id = o.id
     left join accounts d on d.id = o.verification_decided_by
     order by coalesce(v.submitted_at, o.created_at) desc`,
  );
  if (rows.length === 0) return [];

  const orgIds = rows.map((r) => r.id);
  const docRows = await query<{
    id: string;
    organization_id: string;
    document_type: string;
    file_name: string;
    file_path: string;
    uploaded_at: string;
  }>(
    `select id, organization_id, document_type, file_name, file_path, uploaded_at
     from organization_documents where organization_id = any($1) order by uploaded_at asc`,
    [orgIds],
  );
  const docsByOrg = new Map<string, typeof docRows>();
  for (const doc of docRows) {
    const list = docsByOrg.get(doc.organization_id) ?? [];
    list.push(doc);
    docsByOrg.set(doc.organization_id, list);
  }

  return Promise.all(
    rows.map(async (row) => {
      const docs = docsByOrg.get(row.id) ?? [];
      const documents = await Promise.all(
        docs.map(async (doc) => ({
          id: doc.id,
          // File name only — createDocumentUrl() gives admins a real signed link without
          // this list needing one, avoiding N signed-URL round trips for a page that
          // mostly just needs to show what was uploaded and when.
          name: doc.file_name,
          type: doc.document_type,
          status: "received" as const,
          uploadedAt: doc.uploaded_at,
        })),
      );

      const timeline: AdminOrganisationRow["timeline"] = [
        { id: "registered", label: "Registered", at: row.created_at, actor: "System", state: "done" },
      ];
      if (row.submitted_at) {
        timeline.push({
          id: "submitted",
          label: "Submitted for verification",
          at: row.submitted_at,
          actor: row.contact_full_name ?? "Applicant",
          state: row.verification_status === "pending" ? "current" : "done",
        });
      }
      if (row.verification_status === "verified" || row.verification_status === "rejected") {
        timeline.push({
          id: "decision",
          label: row.verification_status === "verified" ? "Verified" : "Verification rejected",
          at: row.verification_decided_at ?? row.submitted_at ?? row.created_at,
          actor: row.verification_decided_by_name ?? "Admin",
          state: row.verification_status === "verified" ? "done" : "failed",
        });
      }

      return {
        id: row.id,
        name: row.name,
        kind: ORG_TYPE_TO_CHANNEL_KIND[row.type] ?? row.type,
        registrationNumber: row.abn ?? "—",
        country: row.country ?? "—",
        representative: row.authorised_person_name || row.contact_full_name || "—",
        representativeEmail: row.contact_email ?? "—",
        verificationStatus: row.verification_status,
        submittedAt: row.submitted_at ?? row.created_at,
        documents,
        timeline,
        channelId: row.id,
      };
    }),
  );
}

export type DecideOrganisationResult = { outcome: "success" } | { outcome: "not_found" };

export async function decideOrganisationVerification(
  admin: { id: string; name: string },
  organizationId: string,
  decision: "verified" | "rejected",
  reason: string,
): Promise<DecideOrganisationResult> {
  const rows = await query<{ id: string }>(
    `update organizations
     set verification_status = $2, verification_decided_at = now(), verification_decided_by = $3, verification_reason = $4
     where id = $1
     returning id`,
    [organizationId, decision, admin.id, reason],
  );
  if (rows.length === 0) return { outcome: "not_found" };

  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: "admin",
    action: `organisation.${decision}`,
    targetType: "organisation",
    targetId: organizationId,
    reason,
    severity: decision === "rejected" ? "warning" : "info",
  });
  return { outcome: "success" };
}

// Re-exported so the admin route doesn't need a second import of storage.ts just for
// this one helper.
export { createDocumentUrl };
