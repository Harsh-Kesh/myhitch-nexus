// Server-only. The first real slice of live streaming's server side — event identity,
// ownership and lifecycle. "Go Live Now" has been 100% client-side/mock (store.liveEvents,
// mock-api/index.ts) since this project began: there was no live_events row anywhere, which
// is why the chat/poll moderation routes (liveChat.ts) could only ever require "is signed
// in," never "is this account this specific stream's actual host" — found during the
// 2026-09-24 platform audit. Real-time video ingest (Mux Live/AWS IVS) stays vendor-blocked
// and out of scope here; this only covers what doesn't need a vendor: the event record,
// who owns it, its status, and its access rule.
import "server-only";
import { query, queryOne } from "./db";
import { isChannelMember } from "./channelSettings";
import { checkRealContentAccess } from "./subscriptions";

export type LiveEventStatus = "scheduled" | "live" | "ended" | "cancelled";
export type LiveEventAccessType = "public" | "private" | "ticketed" | "subscriber-only" | "invitation-only";

export interface RealLiveEvent {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  status: LiveEventStatus;
  accessType: LiveEventAccessType;
  scheduledStart: string | null;
  actualStart: string | null;
  endedAt: string | null;
  chatEnabled: boolean;
  createdAt: string;
}

interface LiveEventRow {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  status: LiveEventStatus;
  access_type: LiveEventAccessType;
  scheduled_start: string | null;
  actual_start: string | null;
  ended_at: string | null;
  chat_enabled: boolean;
  created_at: string;
}

function mapRow(row: LiveEventRow): RealLiveEvent {
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    description: row.description,
    status: row.status,
    accessType: row.access_type,
    scheduledStart: row.scheduled_start,
    actualStart: row.actual_start,
    endedAt: row.ended_at,
    chatEnabled: row.chat_enabled,
    createdAt: row.created_at,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getLiveEventById(id: string): Promise<RealLiveEvent | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const row = await queryOne<LiveEventRow>(`select * from live_events where id = $1`, [id]);
  return row ? mapRow(row) : null;
}

export async function listChannelLiveEvents(channelId: string): Promise<RealLiveEvent[]> {
  const rows = await query<LiveEventRow>(
    `select * from live_events where channel_id = $1 order by created_at desc`,
    [channelId],
  );
  return rows.map(mapRow);
}

export type CreateLiveEventResult =
  | { outcome: "success"; event: RealLiveEvent }
  | { outcome: "not_channel_member" }
  | { outcome: "invalid"; reason: string };

export async function createLiveEvent(
  accountId: string,
  channelId: string,
  input: { title: string; description?: string | null; accessType?: LiveEventAccessType; scheduledStart?: string | null },
): Promise<CreateLiveEventResult> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  if (!input.title.trim() || input.title.trim().length < 3) {
    return { outcome: "invalid", reason: "A title of at least 3 characters is required." };
  }
  const row = await queryOne<LiveEventRow>(
    `insert into live_events (channel_id, title, description, access_type, scheduled_start)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [channelId, input.title.trim().slice(0, 200), input.description?.trim() || null, input.accessType ?? "public", input.scheduledStart ?? null],
  );
  return { outcome: "success", event: mapRow(row!) };
}

export type LiveEventLifecycleResult =
  | { outcome: "success"; event: RealLiveEvent }
  | { outcome: "not_found" }
  | { outcome: "not_channel_member" }
  | { outcome: "invalid"; reason: string };

export async function startLiveEvent(accountId: string, eventId: string): Promise<LiveEventLifecycleResult> {
  const event = await getLiveEventById(eventId);
  if (!event) return { outcome: "not_found" };
  if (!(await isChannelMember(accountId, event.channelId))) return { outcome: "not_channel_member" };
  if (event.status !== "scheduled") {
    return { outcome: "invalid", reason: `Can't go live from status "${event.status}".` };
  }
  const row = await queryOne<LiveEventRow>(
    `update live_events set status = 'live', actual_start = now() where id = $1 returning *`,
    [eventId],
  );
  return { outcome: "success", event: mapRow(row!) };
}

export async function endLiveEvent(accountId: string, eventId: string): Promise<LiveEventLifecycleResult> {
  const event = await getLiveEventById(eventId);
  if (!event) return { outcome: "not_found" };
  if (!(await isChannelMember(accountId, event.channelId))) return { outcome: "not_channel_member" };
  if (event.status !== "live") {
    return { outcome: "invalid", reason: `Can't end a stream from status "${event.status}".` };
  }
  const row = await queryOne<LiveEventRow>(
    `update live_events set status = 'ended', ended_at = now() where id = $1 returning *`,
    [eventId],
  );
  return { outcome: "success", event: mapRow(row!) };
}

/** Real per-stream moderator check for chat/poll moderation — replaces the "is signed in"
 * fallback liveChat.ts's routes used before this table existed. The event's own channel
 * membership is the moderator set (same bar Studio itself uses for every other per-
 * channel write), plus platform-wide moderator/super-admin roles. */
export async function isLiveEventModerator(accountId: string, eventId: string, accountRoles: string[]): Promise<boolean> {
  if (accountRoles.includes("moderator") || accountRoles.includes("super-admin")) return true;
  const event = await getLiveEventById(eventId);
  if (!event) return false;
  return isChannelMember(accountId, event.channelId);
}

/** Real access-mode enforcement for reading/posting in a live event's chat or polls (SRS
 * FR-6.4.6's same "no access without a real check" spirit, applied to live rather than
 * VOD). 'ticketed' and 'invitation-only' have no real purchase/invite mechanism anywhere
 * in this codebase yet (rent/buy/PPV-style checkout is retired platform-wide under the
 * six-tier pricing model, and there's no live-specific ticketing table) — honestly denied
 * to everyone but the event's own channel members rather than faked as granted, the same
 * "not built yet, not silently bypassed" stance the codebase already takes on retired VOD
 * pricing and on unbuilt payout tax handling. */
export async function canAccessLiveEvent(event: RealLiveEvent, accountId: string | null): Promise<boolean> {
  if (accountId && (await isChannelMember(accountId, event.channelId))) return true;
  switch (event.accessType) {
    case "public":
      return true;
    case "subscriber-only":
      return accountId ? checkRealContentAccess(accountId) : false;
    case "ticketed":
    case "invitation-only":
    case "private":
      return false;
  }
}
