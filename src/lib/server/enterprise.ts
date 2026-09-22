// Server-only. Enterprise Product Backend: Developer & Partner API (TPI-9),
// Client Review & Approval Workflow, Large File Transfers, and Private Workspaces.
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { query, queryOne } from "./db";
import { SITE_URL } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                            0. Organization Resolution                      */
/* -------------------------------------------------------------------------- */

export async function resolveOrgIdForAccount(accountId?: string | null): Promise<string> {
  if (accountId) {
    const memberRow = await queryOne<{ organization_id: string }>(
      `select organization_id from memberships where account_id = $1 order by created_at asc limit 1`,
      [accountId],
    );
    if (memberRow?.organization_id) return memberRow.organization_id;
  }

  const defaultOrg = await queryOne<{ id: string }>(
    `select id from organizations order by created_at asc limit 1`,
  );
  if (defaultOrg?.id) return defaultOrg.id;

  throw new Error("No organization found in database to attach enterprise assets");
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
  let videoData: any = null;
  if (isUuid) {
    videoData = await queryOne(
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
  status: "active" | "expired";
  download_count: number;
  expires_at: string;
  created_at: string;
}

export async function createEnterpriseTransfer(input: {
  orgId: string;
  title: string;
  fileName: string;
  fileSizeBytes: number;
  downloadUrl?: string | null;
  expiresDays?: number;
}): Promise<EnterpriseTransferRow> {
  const expiresDays = input.expiresDays ?? 14;
  const row = await queryOne<EnterpriseTransferRow>(
    `insert into enterprise_transfers (
      org_id, title, file_name, file_size_bytes, download_url, expires_at
    ) values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
    returning *`,
    [
      input.orgId,
      input.title.trim(),
      input.fileName.trim(),
      input.fileSizeBytes,
      input.downloadUrl ?? null,
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
