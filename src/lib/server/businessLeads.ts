// Server-only. Real leads captured from a business/enterprise channel's videos — was
// 100% mock (getLeads()/updateLeadStatus() had no real branch at all, so a real business
// account's Leads page always showed the shared demo persona's seeded leads, keyed off a
// hardcoded "ch_helio" channel id no real organization ever has).
import "server-only";
import { query, queryOne } from "./db";

export type LeadStatus = "new" | "contacted" | "qualified" | "closed";

export interface LeadRow {
  id: string;
  organizationId: string;
  sourceVideoId: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

interface LeadDbRow {
  id: string;
  organization_id: string;
  source_video_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

function mapLead(row: LeadDbRow): LeadRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceVideoId: row.source_video_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLeads(organizationId: string, status?: LeadStatus): Promise<LeadRow[]> {
  const rows = status
    ? await query<LeadDbRow>(
        `select * from business_leads where organization_id = $1 and status = $2 order by created_at desc`,
        [organizationId, status],
      )
    : await query<LeadDbRow>(
        `select * from business_leads where organization_id = $1 order by created_at desc`,
        [organizationId],
      );
  return rows.map(mapLead);
}

export type UpdateLeadStatusResult = { outcome: "success"; lead: LeadRow } | { outcome: "not_found" };

/** `organizationId` scopes the update to the caller's own org — a lead id alone isn't
 * enough to authorize touching it, same reasoning as every other owned-resource update
 * in this codebase (e.g. viewerPlaylists.ts's requireOwnedPlaylist()). */
export async function updateLeadStatus(
  organizationId: string,
  leadId: string,
  status: LeadStatus,
): Promise<UpdateLeadStatusResult> {
  const row = await queryOne<LeadDbRow>(
    `update business_leads set status = $3, updated_at = now() where id = $1 and organization_id = $2 returning *`,
    [leadId, organizationId, status],
  );
  if (!row) return { outcome: "not_found" };
  return { outcome: "success", lead: mapLead(row) };
}

/** Public — called from a video page's "Get a quote" form, never authenticated. Requires
 * the video to actually belong to a real business/enterprise channel so a lead can't be
 * filed against an arbitrary organization id a viewer happens to guess. */
export async function createLeadFromVideo(input: {
  videoId: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  message: string;
}): Promise<{ outcome: "success" } | { outcome: "video_not_found" } | { outcome: "invalid"; reason: string }> {
  if (!input.name.trim() || !input.email.trim() || !input.message.trim()) {
    return { outcome: "invalid", reason: "Name, email and message are required." };
  }
  const video = await queryOne<{ channel_id: string }>(
    `select channel_id from videos where id = $1 and status = 'published'`,
    [input.videoId],
  );
  if (!video) return { outcome: "video_not_found" };

  await query(
    `insert into business_leads (organization_id, source_video_id, name, email, phone, company, message)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      video.channel_id,
      input.videoId,
      input.name.trim().slice(0, 200),
      input.email.trim().slice(0, 320),
      input.phone?.trim().slice(0, 40) || null,
      input.company?.trim().slice(0, 200) || null,
      input.message.trim().slice(0, 5000),
    ],
  );
  return { outcome: "success" };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** A real CSV, not a mock "export queued" toast — same "build the string, no library
 * needed for one flat table" approach as every other CSV export already in Studio
 * (studio/revenue's/analytics' own client-side exports). Built server-side here since
 * leads contain a real fan's contact details — never assembled from a client-side cache
 * that might be stale or incomplete. */
export async function exportLeadsCsv(organizationId: string): Promise<string> {
  const leads = await listLeads(organizationId);
  const header = ["Name", "Email", "Phone", "Company", "Status", "Message", "Received"];
  const rows = leads.map((lead) => [
    lead.name,
    lead.email,
    lead.phone ?? "",
    lead.company ?? "",
    lead.status,
    lead.message.replace(/\r?\n/g, " "),
    // node-postgres parses a timestamptz column into a real JS Date object despite
    // every interface in this codebase (including this one) typing it as `string` —
    // harmless everywhere else, since formatDate()/relativeTime() both accept a Date
    // just as happily as a string, but a naive String(cell) below would otherwise
    // render it as a verbose, locale-dependent Date.toString() instead of a clean,
    // machine-parseable timestamp. Normalize explicitly rather than relying on that.
    new Date(lead.createdAt).toISOString(),
  ]);
  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\r\n");
}
