-- Real admin backend, first slice (docs/DEVELOPMENT-PLAN.md's P2/P4 entries): a
-- moderation queue, an append-only audit log, and account status — every admin write
-- path (moderation decisions, user status/role changes, org verification decisions) has
-- been 100% in-memory mock data (src/lib/mock-api/data/admin.ts) since this project
-- began. Real triggers already exist for some of this (publishVideo()'s needsReview
-- gate has written videos.status = 'pending' since P2's first slice) with nothing real
-- to insert into until now.

create table moderation_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('content', 'comment', 'live', 'copyright', 'channel', 'campaign')),
  target_id uuid not null,
  title text not null,
  -- Nullable: not every kind resolves to a channel (none of the real triggers built
  -- alongside this migration leave it null today, but a future copyright/live-incident
  -- trigger might not have one either).
  channel_id uuid references organizations(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  queue text not null check (queue in ('pending-review', 'reported', 'copyright', 'live-incident', 'verification')),
  report_reasons text[] not null default '{}',
  report_count integer not null default 0,
  status text not null default 'open' check (status in ('open', 'actioned', 'escalated', 'dismissed')),
  assigned_to text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_queue_queue_idx on moderation_queue(queue);
create index moderation_queue_status_idx on moderation_queue(status);
create index moderation_queue_target_idx on moderation_queue(kind, target_id);

create trigger moderation_queue_set_updated_at
  before update on moderation_queue
  for each row execute function set_updated_at();

-- Append-only in intent (the app never issues an UPDATE/DELETE against this table) —
-- not enforced at the DB level yet, matching every other table's "service-role only,
-- no separate write-permission tiers" posture in this project so far.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid references accounts(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  -- text, not uuid: a target can be a mock-store id (still-mock admin surfaces reading
  -- this same log) as well as a real uuid.
  target_id text not null,
  reason text not null default '',
  severity text not null default 'info' check (severity in ('info', 'notice', 'warning', 'critical')),
  ip text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on audit_log(created_at desc);
create index audit_log_target_type_idx on audit_log(target_type);
create index audit_log_severity_idx on audit_log(severity);

-- Makes "suspend a user" a real, enforced action (session.ts/localPassword.ts read this)
-- rather than a UI label with no effect — see src/lib/server/session.ts.
alter table accounts add column status text not null default 'active' check (status in ('active', 'pending', 'suspended', 'closed'));

-- Real decision metadata for organisation verification — organizations.verification_status
-- already existed (20260914000004); nothing recorded who decided it or when until now,
-- which the admin/organisations screen's timeline needs to show real (not fabricated) history.
alter table organizations add column verification_decided_at timestamptz;
alter table organizations add column verification_decided_by uuid references accounts(id);
alter table organizations add column verification_reason text;

alter table moderation_queue enable row level security;
alter table audit_log enable row level security;
