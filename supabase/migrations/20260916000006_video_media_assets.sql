-- Real video upload, first slice — docs/DEVELOPMENT-PLAN.md's P2 entry. Real video
-- publishing has been 100% mock since this project began; this is the write path.
--
-- `processing_status` is deliberately separate from the existing `status` column
-- (draft/pending/published/etc.) rather than a new value in that enum — it's
-- presentation state for the player ("is there actually a playable stream yet"), not an
-- editorial/publication state, and keeping it separate avoids touching
-- docs/openapi.yaml's and SRS-TRACEABILITY.md's existing status semantics. A video can
-- be genuinely `published` (real, in the catalogue, real metadata/rights/pricing) while
-- still `awaiting_transcode` (no real stream yet, since Mux isn't wired up) — the player
-- shows an honest "processing" state for exactly that combination.
alter table videos add column master_asset_path text;
alter table videos add column master_uploaded_at timestamptz;
alter table videos add column master_bytes bigint;
alter table videos add column processing_status text not null default 'none' check (
  processing_status in ('none', 'awaiting_transcode')
);

-- The 40 seeded videos have no real master file and nothing to process — 'none' is
-- exactly right for them already via the column default, no backfill needed.
