// Idempotent, like apply-migrations.mjs — creates the two Supabase Storage buckets this
// build needs if they don't already exist. Safe to re-run any time.
//
// Usage: node --env-file=.env.local scripts/ensure-storage-buckets.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });

const BUCKETS = [
  { id: "video-masters", public: false },
  { id: "audio-masters", public: false },
  { id: "thumbnails", public: true },
  { id: "business-documents", public: false },
  { id: "ad-creatives", public: true },
  { id: "enterprise-transfers", public: false },
];

const { data: existing, error: listError } = await client.storage.listBuckets();
if (listError) {
  console.error("Failed to list buckets:", listError.message);
  process.exit(1);
}
const existingIds = new Set((existing ?? []).map((b) => b.id));

for (const bucket of BUCKETS) {
  if (existingIds.has(bucket.id)) {
    console.log(`skip  ${bucket.id} (already exists)`);
    continue;
  }
  const { error } = await client.storage.createBucket(bucket.id, { public: bucket.public });
  if (error) {
    console.error(`Failed to create bucket ${bucket.id}:`, error.message);
    process.exit(1);
  }
  console.log(`create ${bucket.id} (public: ${bucket.public})`);
}

console.log("done");
