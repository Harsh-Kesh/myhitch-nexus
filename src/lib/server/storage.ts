// Server-only. Real file storage for the first slice of P2 (real video upload) — see
// docs/DEVELOPMENT-PLAN.md's P2 entry. Deliberately Supabase Storage, not Mux: Mux
// (blocked on the client creating an account) is for transcoding/delivery, a completely
// separate concern from archiving the original master file. Supabase Storage is already
// provisioned (same project as the database) and, on the confirmed Pro tier, the 100GB
// storage / 250GB egress included in the base subscription comfortably covers a
// size-capped test slice at no additional cost.
//
// Deliberately temporary: master files belong on Cloudflare R2 before real upload volume
// arrives (cheaper at scale, zero egress fees, and already the archive target named in
// the original Mux research) — this module is the one place that migration touches
// later, everything else calls these functions rather than the Supabase client directly.
import "server-only";
import { createClient } from "@supabase/supabase-js";

const VIDEO_MASTERS_BUCKET = "video-masters";
const THUMBNAILS_BUCKET = "thumbnails";
const BUSINESS_DOCUMENTS_BUCKET = "business-documents";

// Business registration certificates/licences/insurance are a handful of pages, not
// camera masters — capped small mainly to stop someone uploading something unrelated.
const MAX_DOCUMENT_UPLOAD_BYTES = 20 * 1024 * 1024;

// A raw camera master can be huge (the upload wizard's own sample file is 8.64GB) —
// capped well below that to stay safely inside the Pro plan's included storage while
// this feature is still being tested with real accounts, not real production volume.
// Override via env var once that changes (e.g. after migrating to R2).
export const MAX_MASTER_UPLOAD_BYTES = Number(process.env.MAX_MASTER_UPLOAD_BYTES ?? 250 * 1024 * 1024);

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  }
  // Service-role-equivalent key, server-only — bypasses bucket RLS, which is correct
  // here since every caller into this module has already done its own ownership check.
  return createClient(url, key, { auth: { persistSession: false } });
}

function extensionOf(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : "bin";
}

/** A short-lived signed URL the browser uploads the master file to directly — the file
 * itself never passes through our own server. Path is namespaced by channel so a
 * listing/cleanup pass can scope to one channel without a database round trip. */
export async function createMasterUploadUrl(
  channelId: string,
  fileName: string,
  fileSizeBytes: number,
): Promise<{ path: string; signedUrl: string; token: string }> {
  if (fileSizeBytes > MAX_MASTER_UPLOAD_BYTES) {
    throw new Error(
      `File is too large for this preview build (max ${Math.round(MAX_MASTER_UPLOAD_BYTES / (1024 * 1024))}MB).`,
    );
  }

  const path = `${channelId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(fileName)}`;
  const client = getClient();
  const { data, error } = await client.storage.from(VIDEO_MASTERS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`Failed to create an upload URL: ${error?.message ?? "unknown error"}`);
  }
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** Thumbnails are small (a few MB at most) and public — no signed-URL dance needed,
 * this uploads directly server-side from the route handler that already has the file. */
export async function uploadThumbnail(channelId: string, fileName: string, file: Buffer, contentType: string): Promise<string> {
  const path = `${channelId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(fileName)}`;
  const client = getClient();
  const { error } = await client.storage.from(THUMBNAILS_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) {
    throw new Error(`Failed to upload thumbnail: ${error.message}`);
  }
  const { data } = client.storage.from(THUMBNAILS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** A short-lived signed URL for *reading* the master file back — used by
 * videoValidation.ts to run ffprobe against it without pulling the bytes onto this
 * process ourselves (ffprobe reads HTTP(S) input natively). */
export async function createMasterDownloadUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const client = getClient();
  const { data, error } = await client.storage.from(VIDEO_MASTERS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Failed to create a download URL: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

/** Business verification documents (registration certificates, licences, insurance) —
 * private, small, uploaded server-side same as thumbnails, but never made public: a
 * signed URL (createDocumentUrl) is required to read one back. */
export async function uploadBusinessDocument(
  organizationId: string,
  fileName: string,
  file: Buffer,
  contentType: string,
): Promise<{ path: string; bytes: number }> {
  if (file.byteLength > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${Math.round(MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024))}MB).`);
  }
  const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(fileName)}`;
  const client = getClient();
  const { error } = await client.storage
    .from(BUSINESS_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (error) {
    throw new Error(`Failed to upload document: ${error.message}`);
  }
  return { path, bytes: file.byteLength };
}

/** Short-lived signed URL to read a business document back — private bucket, so unlike
 * thumbnails there's no public URL to hand out. */
export async function createDocumentUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const client = getClient();
  const { data, error } = await client.storage.from(BUSINESS_DOCUMENTS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Failed to create a document URL: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

/** Confirms a signed-upload path actually has a real object behind it before a publish
 * is allowed to reference it — part of the server-enforced publish gate, not just a
 * courtesy: a client could otherwise claim any path without ever uploading to it. */
export async function masterAssetExists(path: string): Promise<{ exists: boolean; bytes: number | null }> {
  const client = getClient();
  const segments = path.split("/");
  const fileName = segments.pop()!;
  const dir = segments.join("/");
  const { data, error } = await client.storage.from(VIDEO_MASTERS_BUCKET).list(dir, { search: fileName });
  if (error || !data?.length) return { exists: false, bytes: null };
  const found = data.find((entry) => entry.name === fileName);
  return { exists: Boolean(found), bytes: found?.metadata?.size ?? null };
}
