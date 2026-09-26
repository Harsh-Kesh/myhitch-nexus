-- Nexus Enterprise has no self-serve checkout (it's a "Contact Sales" lead per the /plans
-- page's own copy) — adminOrganizations.ts's own header already says the intended design:
-- "a super-admin sets it once a deal actually closes." Registering with the Enterprise
-- role previously granted full Enterprise Hub access instantly and for free, with zero
-- sales conversation ever happening — this closes that gap with a real pending/active/
-- rejected status, decided by a super-admin, exactly mirroring organizations'
-- verification_status/verification_decided_at/verification_decided_by/verification_reason
-- shape (a different concept — business identity verification — kept separate rather than
-- overloaded).
alter table organizations add column if not exists enterprise_status text
  check (enterprise_status in ('pending', 'active', 'rejected'));
alter table organizations add column if not exists enterprise_decided_at timestamptz;
alter table organizations add column if not exists enterprise_decided_by uuid references accounts(id) on delete set null;
alter table organizations add column if not exists enterprise_notes text;

-- Large file transfers were metadata-only — download_url was whatever link an org member
-- typed in by hand, never a real upload through Nexus. asset_path is a real private-bucket
-- storage path (same signed-upload-then-register shape as video_versions.asset_url);
-- download_url stays for any already-existing manually-entered link, but new transfers
-- always go through the real upload path.
alter table enterprise_transfers add column if not exists asset_path text;
