// Server-only. Enterprise Product Backend: Developer & Partner API (TPI-9),
// Client Review & Approval Workflow, Large File Transfers, and Private Workspaces.
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { query, queryOne } from "./db";
import { SITE_URL } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                            0. Organization Resolution                      */
/* -------------------------------------------------------------------------- */

/** Thrown when the signed-in account has no organization of its own — every caller must
 * catch this and respond 403, never fall back to some other real organization's data. */
export class NoOrganizationError extends Error {}

/** Resolves the signed-in account's OWN organization — never another account's, and
 * never a "pick any org" fallback. The previous version of this function fell back to
 * `select id from organizations order by created_at asc limit 1` (the platform's very
 * first organization ever created) whenever `accountId` was absent or had no
 * membership — meaning an anonymous request, or a signed-in account with no org of its
 * own, was silently treated as a full member of that org across every enterprise/team
 * route. Fixed to fail closed instead. */
export async function resolveOrgIdForAccount(accountId: string): Promise<string> {
  const memberRow = await queryOne<{ organization_id: string }>(
    `select organization_id from memberships where account_id = $1 order by created_at asc limit 1`,
    [accountId],
  );
  if (!memberRow?.organization_id) {
    throw new NoOrganizationError("This account is not a member of any organization.");
  }
  return memberRow.organization_id;
}

/** Real gate for Nexus Enterprise's real business model: no self-serve checkout, a
 * super-admin activates it once a sales deal actually closes (see the 20260930000012
 * migration's own header). `null` covers every non-Enterprise org (the column is simply
 * not applicable to them) — callers treat that the same as "pending" for a producer-role
 * account, since a producer org that somehow has no row yet was never decided either. */
export async function getOrgEnterpriseStatus(
  orgId: string,
): Promise<"pending" | "active" | "rejected" | null> {
  const row = await queryOne<{ enterprise_status: "pending" | "active" | "rejected" | null }>(
    `select enterprise_status from organizations where id = $1`,
    [orgId],
  );
  return row?.enterprise_status ?? null;
}

/** The same real gate business/layout.tsx enforces for the page, re-checked at the API
 * layer too — a pending/rejected Enterprise account must not be able to reach any real
 * Enterprise-only route directly, only because it hasn't loaded the (gated) page. */
export async function isEnterpriseOrgActive(orgId: string): Promise<boolean> {
  return (await getOrgEnterpriseStatus(orgId)) === "active";
}

/* -------------------------------------------------------------------------- */
/*                            1. API Key Management (TPI-9)                   */
/* -------------------------------------------------------------------------- */

export interface ApiKeyRow {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface GeneratedApiKey {
  id: string;
  orgId: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
}

/** The only scopes a partner key may ever carry — in particular, "admin" is never a
 * grantable scope (the Partner API routes treat it as a superuser bypass; it must never
 * be something a client can simply ask for in a POST body). */
const VALID_API_KEY_SCOPES = ["read:catalogue", "embed:player", "write:catalogue"];

export function sanitizeApiKeyScopes(requested: string[] | undefined): string[] {
  const filtered = (requested ?? []).filter((scope) => VALID_API_KEY_SCOPES.includes(scope));
  return filtered.length > 0 ? filtered : ["read:catalogue", "embed:player"];
}

export async function generateApiKey(
  orgId: string,
  name: string,
  scopes: string[] = ["read:catalogue", "embed:player"],
  expiresDays?: number,
): Promise<GeneratedApiKey> {
  const entropy = randomBytes(24).toString("hex");
  const rawKey = `nx_live_${entropy}`;
  const keyPrefix = `nx_live_${entropy.slice(0, 8)}...`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const expiresAt = expiresDays
    ? new Date(Date.now() + expiresDays * 86400 * 1000).toISOString()
    : null;

  const row = await queryOne<ApiKeyRow>(
    `insert into api_keys (org_id, name, key_prefix, key_hash, scopes, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [orgId, name.trim(), keyPrefix, keyHash, scopes, expiresAt],
  );

  if (!row) throw new Error("Failed to create API key");

  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    rawKey,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    createdAt: row.created_at,
  };
}

export async function verifyApiKey(rawKey: string): Promise<{
  valid: boolean;
  orgId?: string;
  scopes?: string[];
  keyId?: string;
}> {
  if (!rawKey.startsWith("nx_live_")) {
    return { valid: false };
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const row = await queryOne<ApiKeyRow>(
    `update api_keys
     set last_used_at = now()
     where key_hash = $1 and (expires_at is null or expires_at > now())
     returning *`,
    [keyHash],
  );

  if (!row) return { valid: false };

  return {
    valid: true,
    orgId: row.org_id,
    scopes: row.scopes,
    keyId: row.id,
  };
}

export async function listApiKeys(orgId: string): Promise<Omit<ApiKeyRow, "key_hash">[]> {
  const rows = await query<ApiKeyRow>(
    `select id, org_id, name, key_prefix, scopes, last_used_at, expires_at, created_at
     from api_keys
     where org_id = $1
     order by created_at desc`,
    [orgId],
  );
  return rows;
}

export async function revokeApiKey(keyId: string, orgId: string): Promise<boolean> {
  const result = await query(
    `delete from api_keys where id = $1 and org_id = $2`,
    [keyId, orgId],
  );
  return (result.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*                     2. Client Review & Approval Workflow                   */
/* -------------------------------------------------------------------------- */

export interface ClientReviewRow {
  id: string;
  org_id: string;
  video_id: string;
  token: string;
  title: string;
  client_name: string;
  client_email: string | null;
  status: "pending" | "approved" | "changes_requested";
  feedback: string | null;
  version: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientReviewInput {
  orgId: string;
  videoId: string;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  version?: number;
  expiresDays?: number;
}

export async function createClientReview(
  input: CreateClientReviewInput,
): Promise<{ review: ClientReviewRow; reviewUrl: string }> {
  const token = randomBytes(16).toString("hex");
  const expiresDays = input.expiresDays ?? 14;

  const row = await queryOne<ClientReviewRow>(
    `insert into client_reviews (
      org_id, video_id, token, title, client_name, client_email, version,
      expires_at
    ) values ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' days')::interval)
    returning *`,
    [
      input.orgId,
      input.videoId,
      token,
      input.title.trim(),
      input.clientName.trim(),
      input.clientEmail ?? null,
      input.version ?? 1,
      expiresDays.toString(),
    ],
  );

  if (!row) throw new Error("Failed to create client review");

  return {
    review: row,
    reviewUrl: `${SITE_URL}/review/${token}`,
  };
}

export async function getClientReviewByToken(token: string): Promise<{
  review: ClientReviewRow;
  video: {
    id: string;
    title: string;
    synopsis: string | null;
    thumbnailUrl: string | null;
    sampleSrc: string;
    durationSeconds: number;
  };
} | null> {
  const review = await queryOne<ClientReviewRow>(
    `select * from client_reviews
     where token = $1 and (expires_at is null or expires_at > now())`,
    [token],
  );

  if (!review) return null;

  // Fetch linked video or fallback to review metadata
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(review.video_id);
  let videoData: { id: string; title: string; synopsis: string | null; thumbnail_url: string | null; duration_seconds: number } | null = null;
  if (isUuid) {
    videoData = await queryOne<{ id: string; title: string; synopsis: string | null; thumbnail_url: string | null; duration_seconds: number }>(
      `select id, title, synopsis, thumbnail_url, duration_seconds from videos where id = $1`,
      [review.video_id],
    );
  }

  return {
    review,
    video: {
      id: review.video_id,
      title: videoData?.title ?? review.title,
      synopsis: videoData?.synopsis ?? "Client review draft video",
      thumbnailUrl: videoData?.thumbnail_url ?? null,
      sampleSrc: "/media/sample-1.mp4",
      durationSeconds: videoData?.duration_seconds ?? 180,
    },
  };
}

export async function submitClientReviewFeedback(
  token: string,
  status: "approved" | "changes_requested",
  feedback?: string | null,
): Promise<ClientReviewRow | null> {
  const row = await queryOne<ClientReviewRow>(
    `update client_reviews
     set status = $1, feedback = $2, updated_at = now()
     where token = $3 and (expires_at is null or expires_at > now())
     returning *`,
    [status, feedback ?? null, token],
  );

  return row;
}

export async function listClientReviews(orgId: string): Promise<ClientReviewRow[]> {
  const rows = await query<ClientReviewRow>(
    `select * from client_reviews
     where org_id = $1
     order by created_at desc`,
    [orgId],
  );
  return rows;
}

/* -------------------------------------------------------------------------- */
/*                           3. Large File Transfers                          */
/* -------------------------------------------------------------------------- */

export interface EnterpriseTransferRow {
  id: string;
  org_id: string;
  title: string;
  file_name: string;
  file_size_bytes: string;
  download_url: string | null;
  asset_path: string | null;
  status: "active" | "expired";
  download_count: number;
  expires_at: string;
  created_at: string;
}

/** `assetPath` is a real, already-uploaded storage path (verified via
 * enterpriseTransferAssetExists() at the route level, same gate video versions/
 * campaign creatives already use) — this was previously a `downloadUrl` string a client
 * typed in by hand, with no real file behind it at all. */
export async function createEnterpriseTransfer(input: {
  orgId: string;
  title: string;
  fileName: string;
  fileSizeBytes: number;
  assetPath: string;
  expiresDays?: number;
}): Promise<EnterpriseTransferRow> {
  const expiresDays = input.expiresDays ?? 14;
  const row = await queryOne<EnterpriseTransferRow>(
    `insert into enterprise_transfers (
      org_id, title, file_name, file_size_bytes, asset_path, expires_at
    ) values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
    returning *`,
    [
      input.orgId,
      input.title.trim(),
      input.fileName.trim(),
      input.fileSizeBytes,
      input.assetPath,
      expiresDays.toString(),
    ],
  );

  if (!row) throw new Error("Failed to create enterprise transfer");
  return row;
}

export async function listEnterpriseTransfers(orgId: string): Promise<EnterpriseTransferRow[]> {
  const rows = await query<EnterpriseTransferRow>(
    `select * from enterprise_transfers
     where org_id = $1
     order by created_at desc`,
    [orgId],
  );
  return rows;
}

export async function getEnterpriseTransfer(id: string): Promise<EnterpriseTransferRow | null> {
  const row = await queryOne<EnterpriseTransferRow>(
    `update enterprise_transfers
     set download_count = download_count + 1
     where id = $1 and (expires_at is null or expires_at > now())
     returning *`,
    [id],
  );
  return row;
}

/* -------------------------------------------------------------------------- */
/*                           4. Enterprise Overview                           */
/* -------------------------------------------------------------------------- */

export async function getEnterpriseOverview(orgId: string) {
  const [keys, reviews, transfers] = await Promise.all([
    listApiKeys(orgId),
    listClientReviews(orgId),
    listEnterpriseTransfers(orgId),
  ]);

  const pendingReviews = reviews.filter((r) => r.status === "pending").length;
  const approvedReviews = reviews.filter((r) => r.status === "approved").length;
  const activeTransfers = transfers.filter((t) => t.status === "active").length;

  return {
    apiKeysCount: keys.length,
    pendingReviewsCount: pendingReviews,
    approvedReviewsCount: approvedReviews,
    activeTransfersCount: activeTransfers,
    reviews,
    transfers,
    keys,
  };
}

/* -------------------------------------------------------------------------- */
/*                    5. Timecoded Client Review Comments                     */
/* -------------------------------------------------------------------------- */

export interface ReviewCommentRow {
  id: string;
  reviewId: string;
  authorName: string;
  timestampSeconds: number;
  content: string;
  createdAt: string;
}

/** Public — a review token, not an account, authorizes reading/adding comments here
 * (same trust model client_reviews itself already uses: knowing the token is what grants
 * access, there's no login for an external client). */
export async function listReviewComments(reviewId: string): Promise<ReviewCommentRow[]> {
  const rows = await query<{
    id: string;
    review_id: string;
    author_name: string;
    timestamp_seconds: number;
    content: string;
    created_at: string;
  }>(
    `select * from review_comments where review_id = $1 order by timestamp_seconds asc, created_at asc`,
    [reviewId],
  );
  return rows.map((row) => ({
    id: row.id,
    reviewId: row.review_id,
    authorName: row.author_name,
    timestampSeconds: row.timestamp_seconds,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export async function addReviewComment(
  reviewId: string,
  authorName: string,
  timestampSeconds: number,
  content: string,
): Promise<ReviewCommentRow | null> {
  if (!content.trim()) return null;
  const row = await queryOne<{
    id: string;
    review_id: string;
    author_name: string;
    timestamp_seconds: number;
    content: string;
    created_at: string;
  }>(
    `insert into review_comments (review_id, author_name, timestamp_seconds, content)
     values ($1, $2, $3, $4) returning *`,
    [reviewId, authorName.trim().slice(0, 120) || "Client", Math.max(0, Math.round(timestampSeconds)), content.trim().slice(0, 2000)],
  );
  if (!row) return null;
  return {
    id: row.id,
    reviewId: row.review_id,
    authorName: row.author_name,
    timestampSeconds: row.timestamp_seconds,
    content: row.content,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/*                       6. Single Sign-On (SAML) config                      */
/* -------------------------------------------------------------------------- */

export interface SsoConfigRow {
  organizationId: string;
  idpMetadataUrl: string | null;
  ssoDomain: string | null;
  enabled: boolean;
  metadataVerified: boolean;
  metadataCheckedAt: string | null;
  updatedAt: string;
}

/** Storing the IdP metadata URL and domain is real; actually authenticating a sign-in
 * against it is not — real SAML requires a certificate-validated assertion exchange this
 * app has no identity-provider integration for yet (Auth0 is this app's own IdP, not a
 * SAML relying party — see docs/DEVELOPMENT-PLAN.md's Auth0 blocker, "no tenant to call
 * yet"). This is the config surface an enterprise admin fills in, honestly stopping
 * short of a working SSO login flow. What IS real: metadataVerified confirms the URL
 * actually resolves to real SAML metadata XML, not a typo or a placeholder — see
 * verifyIdpMetadataUrl() below. */
export async function getSsoConfig(organizationId: string): Promise<SsoConfigRow> {
  const row = await queryOne<{
    organization_id: string;
    idp_metadata_url: string | null;
    sso_domain: string | null;
    enabled: boolean;
    metadata_verified: boolean;
    metadata_checked_at: string | null;
    updated_at: string;
  }>(`select * from enterprise_sso_configs where organization_id = $1`, [organizationId]);
  if (!row) {
    return {
      organizationId,
      idpMetadataUrl: null,
      ssoDomain: null,
      enabled: false,
      metadataVerified: false,
      metadataCheckedAt: null,
      updatedAt: new Date(0).toISOString(),
    };
  }
  return {
    organizationId: row.organization_id,
    idpMetadataUrl: row.idp_metadata_url,
    ssoDomain: row.sso_domain,
    enabled: row.enabled,
    metadataVerified: row.metadata_verified,
    metadataCheckedAt: row.metadata_checked_at,
    updatedAt: row.updated_at,
  };
}

/** Real, bounded check: does this URL actually resolve to real SAML metadata XML? Not a
 * substitute for a real IdP integration (nothing here validates a signing certificate or
 * performs an assertion exchange) — it's the one part of "paste your IdP's metadata URL"
 * that's honestly checkable without one. Never throws — a network failure or a
 * non-metadata response is a real "false", not an error. */
async function verifyIdpMetadataUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const text = await res.text();
    return /<(\w+:)?EntityDescriptor[\s>]/i.test(text);
  } catch {
    return false;
  }
}

export async function saveSsoConfig(
  organizationId: string,
  input: { idpMetadataUrl?: string | null; ssoDomain?: string | null; enabled?: boolean },
): Promise<SsoConfigRow> {
  const idpMetadataUrl = input.idpMetadataUrl?.trim() || null;
  const metadataVerified = idpMetadataUrl ? await verifyIdpMetadataUrl(idpMetadataUrl) : false;

  const row = await queryOne<{
    organization_id: string;
    idp_metadata_url: string | null;
    sso_domain: string | null;
    enabled: boolean;
    metadata_verified: boolean;
    metadata_checked_at: string | null;
    updated_at: string;
  }>(
    `insert into enterprise_sso_configs (organization_id, idp_metadata_url, sso_domain, enabled, metadata_verified, metadata_checked_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (organization_id) do update set
       idp_metadata_url = $2, sso_domain = $3, enabled = $4, metadata_verified = $5, metadata_checked_at = $6, updated_at = now()
     returning *`,
    [
      organizationId,
      idpMetadataUrl,
      input.ssoDomain?.trim() || null,
      input.enabled ?? false,
      metadataVerified,
      idpMetadataUrl ? new Date().toISOString() : null,
    ],
  );
  return {
    organizationId: row!.organization_id,
    idpMetadataUrl: row!.idp_metadata_url,
    ssoDomain: row!.sso_domain,
    enabled: row!.enabled,
    metadataVerified: row!.metadata_verified,
    metadataCheckedAt: row!.metadata_checked_at,
    updatedAt: row!.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/*                            7. Priority Support                             */
/* -------------------------------------------------------------------------- */

export interface SupportTicketRow {
  id: string;
  organizationId: string;
  accountId: string | null;
  subject: string;
  message: string;
  priority: "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

export async function createSupportTicket(input: {
  organizationId: string;
  accountId: string;
  subject: string;
  message: string;
  priority?: "normal" | "high" | "urgent";
}): Promise<{ outcome: "success"; ticket: SupportTicketRow } | { outcome: "invalid"; reason: string }> {
  if (!input.subject.trim() || !input.message.trim()) {
    return { outcome: "invalid", reason: "A subject and message are required." };
  }
  const row = await queryOne<{
    id: string;
    organization_id: string;
    account_id: string | null;
    subject: string;
    message: string;
    priority: "normal" | "high" | "urgent";
    status: "open" | "in_progress" | "resolved";
    created_at: string;
  }>(
    `insert into support_tickets (organization_id, account_id, subject, message, priority)
     values ($1, $2, $3, $4, $5) returning *`,
    [input.organizationId, input.accountId, input.subject.trim().slice(0, 200), input.message.trim().slice(0, 5000), input.priority ?? "high"],
  );
  return {
    outcome: "success",
    ticket: {
      id: row!.id,
      organizationId: row!.organization_id,
      accountId: row!.account_id,
      subject: row!.subject,
      message: row!.message,
      priority: row!.priority,
      status: row!.status,
      createdAt: row!.created_at,
    },
  };
}

export async function listSupportTickets(organizationId: string): Promise<SupportTicketRow[]> {
  const rows = await query<{
    id: string;
    organization_id: string;
    account_id: string | null;
    subject: string;
    message: string;
    priority: "normal" | "high" | "urgent";
    status: "open" | "in_progress" | "resolved";
    created_at: string;
  }>(`select * from support_tickets where organization_id = $1 order by created_at desc`, [organizationId]);
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    subject: row.subject,
    message: row.message,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
  }));
}

/* -------------------------------------------------------------------------- */
/*                       8. Org-scoped Audit Trail                            */
/* -------------------------------------------------------------------------- */

export interface OrgAuditEntry {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  severity: string;
  createdAt: string;
}

/** audit_log has no organization_id column of its own (confirmed by reading its schema —
 * it's keyed by actor + target, not by org) — "this organization's audit trail" is real,
 * but means "actions taken by any of this org's own members," the honest available
 * definition given the existing table, not "every audit event that ever touched this
 * org's resources" (which would need a much larger join across videos/campaigns/etc). */
export async function listOrgAuditLog(
  organizationId: string,
  filters: { severity?: string; targetType?: string } = {},
): Promise<OrgAuditEntry[]> {
  const conditions = ["actor_account_id in (select account_id from memberships where organization_id = $1)"];
  const params: unknown[] = [organizationId];
  if (filters.severity) {
    params.push(filters.severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (filters.targetType) {
    params.push(filters.targetType);
    conditions.push(`target_type = $${params.length}`);
  }
  const rows = await query<{
    id: string;
    actor_name: string;
    actor_role: string;
    action: string;
    target_type: string;
    target_id: string;
    reason: string;
    severity: string;
    created_at: string;
  }>(
    `select id, actor_name, actor_role, action, target_type, target_id, reason, severity, created_at
     from audit_log where ${conditions.join(" and ")} order by created_at desc limit 300`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    severity: row.severity,
    createdAt: row.created_at,
  }));
}

/* -------------------------------------------------------------------------- */
/*                          9. Video Asset Versioning                         */
/* -------------------------------------------------------------------------- */

export interface VideoVersionRow {
  id: string;
  videoId: string;
  versionNumber: number;
  title: string;
  assetUrl: string;
  changesNotes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export async function listVideoVersions(videoId: string): Promise<VideoVersionRow[]> {
  const rows = await query<{
    id: string;
    video_id: string;
    version_number: number;
    title: string;
    asset_url: string;
    changes_notes: string | null;
    created_by: string | null;
    created_at: string;
  }>(`select * from video_versions where video_id = $1 order by version_number desc`, [videoId]);
  return rows.map((row) => ({
    id: row.id,
    videoId: row.video_id,
    versionNumber: row.version_number,
    title: row.title,
    assetUrl: row.asset_url,
    changesNotes: row.changes_notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function createVideoVersion(input: {
  videoId: string;
  title: string;
  assetUrl: string;
  changesNotes?: string | null;
  createdBy: string;
}): Promise<VideoVersionRow> {
  const nextVersion = await queryOne<{ next: number }>(
    `select coalesce(max(version_number), 0) + 1 as next from video_versions where video_id = $1`,
    [input.videoId],
  );
  const row = await queryOne<{
    id: string;
    video_id: string;
    version_number: number;
    title: string;
    asset_url: string;
    changes_notes: string | null;
    created_by: string | null;
    created_at: string;
  }>(
    `insert into video_versions (video_id, version_number, title, asset_url, changes_notes, created_by)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [input.videoId, nextVersion?.next ?? 1, input.title.trim().slice(0, 200), input.assetUrl, input.changesNotes?.trim() || null, input.createdBy],
  );
  return {
    id: row!.id,
    videoId: row!.video_id,
    versionNumber: row!.version_number,
    title: row!.title,
    assetUrl: row!.asset_url,
    changesNotes: row!.changes_notes,
    createdBy: row!.created_by,
    createdAt: row!.created_at,
  };
}
