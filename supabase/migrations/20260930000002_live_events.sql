-- Real live-event records (FR-6.5.1/6.5.2) — "Go Live Now" has been 100% client-side/mock
-- since P5 started (see docs/DEVELOPMENT-PLAN.md's 2026-09-24 audit entry): there was no
-- server-side row at all for a live event, which is why chat/poll moderation
-- (live_chat_and_polls migration) could only require "is signed in," never "is this
-- account this stream's actual host." This table is that missing record. Real-time video
-- ingest itself (Mux Live/AWS IVS) stays vendor-blocked and out of scope — this is only
-- the event's identity, ownership, lifecycle and access rule, which don't need a vendor.
create table if not exists live_events (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  -- Mirrors LiveAccessType (mock-api/types.ts) minus nothing — every value is representable,
  -- even though 'ticketed'/'invitation-only' have no real purchase/invite flow behind them
  -- yet (see liveEvents.ts's canAccessLiveEvent()) — an honest gap, not a missing value.
  access_type text not null default 'public' check (access_type in ('public', 'private', 'ticketed', 'subscriber-only', 'invitation-only')),
  scheduled_start timestamptz,
  actual_start timestamptz,
  ended_at timestamptz,
  chat_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists live_events_channel_idx on live_events(channel_id, created_at desc);
create index if not exists live_events_status_idx on live_events(status);
