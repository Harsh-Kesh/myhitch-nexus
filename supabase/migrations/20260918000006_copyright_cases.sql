-- Real copyright notice-and-action (SEC-5) — a claim → takedown → counter-notice →
-- decision workflow with a real repeat-infringer strike counter. Deliberately scoped to
-- copyright only, not a general "legal/safety/payment case" system: those other
-- AdminCase domains (src/lib/mock-api/types.ts) still have no real consumer behind them,
-- same "don't build for nothing downstream" reasoning as the six still-mock platform
-- config tables. The admin case-management UI (/admin/reports) already models a
-- copyright case as a worked mock example (case_leg_0184) — this promotes that one
-- domain to real, real-ish DMCA-style: act on a well-formed notice immediately (that's
-- what safe-harbor notice-and-action means — the provider isn't meant to adjudicate
-- merits before acting), let the uploader contest it with a counter-notice, and give an
-- admin the final call rather than leaving it to timers alone. No case_notes table: the
-- existing audit_log (target_type='copyright_case') already serves as a real,
-- already-built timeline, so a case's history doesn't need a second table.
create table copyright_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  video_id uuid not null references videos(id) on delete cascade,
  channel_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'open' check (status in (
    'open', 'counter-notice-received', 'escalated', 'upheld', 'rejected', 'restored'
  )),

  -- Claimant (rights holder) — no account required to file a notice, same as real DMCA
  -- intake; matched against the statutory good-faith/accuracy declarations a real notice
  -- legally requires.
  claimant_name text not null,
  claimant_email text not null,
  claimant_organization text,
  work_description text not null,
  infringement_description text not null,
  good_faith_statement boolean not null,
  accuracy_statement boolean not null,

  -- Counter-notice, filed later by the video's real owning account (verified via
  -- memberships, not merely self-asserted — a real identity check safe-harbor law itself
  -- doesn't require but this platform can, since accounts already exist).
  counter_notice_account_id uuid references accounts(id),
  counter_notice_statement text,
  counter_notice_submitted_at timestamptz,
  -- Real DMCA gives a claimant 10 business days to escalate once a counter-notice is
  -- filed before restoration is required; approximated here as 14 calendar days rather
  -- than a real business-day calendar (holidays, weekends) — a documented
  -- simplification, not a legal-accuracy claim.
  restoration_eligible_at timestamptz,

  decided_at timestamptz,
  decided_by uuid references accounts(id),
  decision_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index copyright_cases_video_id_idx on copyright_cases(video_id);
create index copyright_cases_channel_id_idx on copyright_cases(channel_id);
create index copyright_cases_status_idx on copyright_cases(status);

create trigger copyright_cases_set_updated_at
  before update on copyright_cases
  for each row execute function set_updated_at();

create sequence copyright_case_reference_seq;

-- A strike per upheld case, against the account that owned the channel at decision time
-- (not the channel itself, which can change hands) — the real "repeat-infringer"
-- signal. copyrightStrikeThreshold in copyright.ts reads this table's count per account
-- rather than a denormalised counter, so the threshold can change without a backfill.
create table copyright_strikes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  copyright_case_id uuid not null references copyright_cases(id) on delete cascade,
  issued_at timestamptz not null default now()
);

create index copyright_strikes_account_id_idx on copyright_strikes(account_id);

alter table copyright_cases enable row level security;
alter table copyright_strikes enable row level security;
