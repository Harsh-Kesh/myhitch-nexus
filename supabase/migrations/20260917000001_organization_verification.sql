-- Real organisation verification, free half — docs/DEVELOPMENT-PLAN.md's 2026-09-17
-- entry. `organizations.verification_status` already existed (unverified/pending/
-- verified/rejected, from 20260914000004) but nothing real ever wrote to it — this is
-- the write path: a real submission form backed by these two tables, landing the org at
-- 'pending' honestly (not silently 'verified') since nothing here can actually confirm a
-- business is legitimate yet. Deliberately does NOT cover ID verification, bank account
-- validation, or risk/fraud screening — those need paid KYC/KYB vendors, not yet
-- approved (see the same dev-plan entry). ABN Lookup is the one real automated check
-- here — the Australian Business Register's ABN Lookup web service is free.
create table organization_verification (
  organization_id uuid primary key references organizations(id) on delete cascade,

  -- Business identity
  legal_entity_name text,
  trading_name text,
  abn text,
  acn text,
  entity_type text,
  gst_registered boolean,
  business_registration_date date,
  country_of_registration text not null default 'AU',

  -- Business address
  registered_address text,
  principal_address text,
  operating_locations text,
  address_same_as_registered boolean not null default true,

  -- Primary contact
  contact_full_name text,
  contact_position text,
  contact_email text,
  contact_mobile text,

  -- Authorised person (who can represent the business) — identity/liveness
  -- verification itself is the deferred, paid part; this is just who they say it is.
  authorised_person_name text,
  authorised_person_position text,

  -- Business activity
  industry text,
  business_description text,
  website text,
  platforms text[] not null default '{}',
  products_services text,

  -- Declaration
  information_accurate boolean not null default false,
  authority_confirmed boolean not null default false,
  terms_accepted boolean not null default false,
  privacy_accepted boolean not null default false,

  -- Cached result of the free ABN Lookup call (abnLookup.ts) — re-checked whenever the
  -- creator re-runs the lookup, not on a schedule.
  abn_lookup_checked_at timestamptz,
  abn_lookup_status text,
  abn_lookup_entity_name text,
  abn_lookup_entity_type text,
  abn_lookup_gst_effective_from date,
  abn_lookup_state text,
  abn_lookup_postcode text,

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_verification_set_updated_at
  before update on organization_verification
  for each row execute function set_updated_at();

create table organization_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  document_type text not null check (document_type in ('business_registration', 'licence', 'insurance', 'other')),
  file_path text not null,
  file_name text not null,
  uploaded_by uuid not null references accounts(id),
  uploaded_at timestamptz not null default now()
);

create index organization_documents_org_id_idx on organization_documents(organization_id);
