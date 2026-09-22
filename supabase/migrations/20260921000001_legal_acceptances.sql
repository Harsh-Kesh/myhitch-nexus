-- Real consent capture at registration (DEC-12, docs/DEVELOPMENT-PLAN.md §0): "we build
-- the mechanics only — versioned documents, acceptance tracking, consent capture — and
-- integrate the lawyer's actual text whenever it's supplied, without that blocking
-- engineering progress." The register wizard's "I accept the terms of service and
-- privacy policy" checkbox (src/app/auth/register/page.tsx) has gated the client-side
-- Continue button since it was built, but was never sent to the server or persisted
-- anywhere — this table and POST /api/auth/register's new check close that gap.
--
-- document_version is a placeholder ('pending-legal-text') until the digital lawyer
-- supplies the actual wording; recorded now anyway because a real DB timestamp of "this
-- account accepted something at registration" is itself the compliance-relevant fact —
-- swapping the placeholder for a real version string later doesn't invalidate it.
create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  document_type text not null check (document_type in ('terms_and_privacy')),
  document_version text not null default 'pending-legal-text',
  accepted_at timestamptz not null default now(),
  ip text
);

create index legal_acceptances_account_id_idx on legal_acceptances(account_id);

alter table legal_acceptances enable row level security;
