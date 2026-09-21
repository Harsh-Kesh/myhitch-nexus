// Server-only. Real moderation queue + audit log — the P2/P4 gap where two triggers
// already existed (publishVideo()'s needsReview gate, a comment auto-hold rule) with
// nothing real to write into, and every admin decision (moderation actions, user/org
// changes) has been in-memory-only since this project began. See
// docs/DEVELOPMENT-PLAN.md's 2026-09-17 admin-screens entry.
import "server-only";
import { query, queryOne } from "./db";

export type ModerationKind = "content" | "comment" | "live" | "copyright" | "channel" | "campaign";
export type ModerationQueueName = "pending-review" | "reported" | "copyright" | "live-incident" | "verification";
export type ModerationPriority = "low" | "normal" | "high" | "urgent";
export type ModerationStatus = "open" | "actioned" | "escalated" | "dismissed";
export type AuditSeverity = "info" | "notice" | "warning" | "critical";

export interface ModerationQueueItem {
  id: string;
  kind: ModerationKind;
  targetId: string;
  title: string;
  channelId: string | null;
  submittedAt: string;
  priority: ModerationPriority;
  queue: ModerationQueueName;
  reportReasons: string[];
  reportCount: number;
  status: ModerationStatus;
  assignedTo: string | null;
  notes: string;
}

interface QueueDbRow {
  id: string;
  kind: ModerationKind;
  target_id: string;
  title: string;
  channel_id: string | null;
  submitted_at: string;
  priority: ModerationPriority;
  queue: ModerationQueueName;
  report_reasons: string[];
  report_count: number;
  status: ModerationStatus;
  assigned_to: string | null;
  notes: string;
}

function mapQueueRow(row: QueueDbRow): ModerationQueueItem {
  return {
    id: row.id,
    kind: row.kind,
    targetId: row.target_id,
    title: row.title,
    channelId: row.channel_id,
    submittedAt: row.submitted_at,
    priority: row.priority,
    queue: row.queue,
    reportReasons: row.report_reasons,
    reportCount: row.report_count,
    status: row.status,
    assignedTo: row.assigned_to,
    notes: row.notes,
  };
}

/** Inserts a real queue item — called by publishVideo()/updateVideoStatus() (a video
 * routed to `pending`) and postComment() (an auto-held comment). */
export async function flagForReview(input: {
  kind: ModerationKind;
  targetId: string;
  title: string;
  channelId: string | null;
  queue: ModerationQueueName;
  priority?: ModerationPriority;
  notes: string;
}): Promise<void> {
  await query(
    `insert into moderation_queue (kind, target_id, title, channel_id, queue, priority, notes)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [input.kind, input.targetId, input.title, input.channelId, input.queue, input.priority ?? "normal", input.notes],
  );
}

export type ReportVideoResult = { outcome: "success" } | { outcome: "not_found" };

/** The video page's Report button used to just show a "Report submitted" toast on
 * click — no reason, no details, nothing written anywhere real, so an admin had no way
 * to ever see it. moderation_queue's own 'reported' queue and its report_reasons/
 * report_count columns existed for exactly this since the table was created, unused
 * until now. One open queue item per video accumulates repeat reports (report_count,
 * and every distinct reason seen) rather than creating a duplicate row per report. */
export async function reportVideo(
  videoId: string,
  reason: string,
  details?: string,
): Promise<ReportVideoResult> {
  const video = await queryOne<{ title: string; channel_id: string }>(
    `select title, channel_id from videos where id = $1`,
    [videoId],
  );
  if (!video) return { outcome: "not_found" };

  const noteLine = details?.trim()
    ? `Reported: ${reason} — "${details.trim().slice(0, 500)}"`
    : `Reported: ${reason}`;

  const existing = await queryOne<{ id: string; report_reasons: string[] }>(
    `select id, report_reasons from moderation_queue
     where kind = 'content' and target_id = $1 and queue = 'reported' and status = 'open'`,
    [videoId],
  );

  if (existing) {
    const reasons = existing.report_reasons.includes(reason)
      ? existing.report_reasons
      : [...existing.report_reasons, reason];
    await query(
      `update moderation_queue
       set report_count = report_count + 1, report_reasons = $2,
           notes = notes || chr(10) || $3, updated_at = now()
       where id = $1`,
      [existing.id, reasons, noteLine],
    );
  } else {
    await query(
      `insert into moderation_queue (kind, target_id, title, channel_id, queue, priority, report_reasons, report_count, notes)
       values ('content', $1, $2, $3, 'reported', $4, $5, 1, $6)`,
      [videoId, video.title, video.channel_id, reason === "child-safety" ? "urgent" : "normal", [reason], noteLine],
    );
  }

  return { outcome: "success" };
}

export async function listModerationQueue(queue?: ModerationQueueName): Promise<ModerationQueueItem[]> {
  const rows = await query<QueueDbRow>(
    `select * from moderation_queue
     ${queue ? "where queue = $1" : ""}
     order by (status != 'open'),
       case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
       submitted_at asc`,
    queue ? [queue] : [],
  );
  return rows.map(mapQueueRow);
}

export type ModerationAction =
  | "approve"
  | "reject"
  | "request-changes"
  | "restrict"
  | "demonetise"
  | "geo-block"
  | "age-restrict"
  | "suspend"
  | "remove";

export type ActionModerationItemResult =
  | { outcome: "success"; auditId: string; targetId: string }
  | { outcome: "not_found" };

/** Applies an admin decision to the underlying record (video/comment) and the queue item
 * itself, then writes an audit entry — real counterpart of the mock's
 * actionModerationItem(), same action→effect mapping. */
export async function actionModerationItem(
  admin: { id: string; name: string },
  itemId: string,
  action: ModerationAction,
  reason: string,
): Promise<ActionModerationItemResult> {
  const item = await queryOne<QueueDbRow>(`select * from moderation_queue where id = $1`, [itemId]);
  if (!item) return { outcome: "not_found" };

  if (item.kind === "content") {
    if (action === "approve") {
      await query(`update videos set status = 'published', published_at = coalesce(published_at, now()) where id = $1`, [item.target_id]);
    } else if (action === "reject") {
      await query(`update videos set status = 'rejected' where id = $1`, [item.target_id]);
    } else if (action === "restrict" || action === "geo-block") {
      await query(`update videos set status = 'restricted' where id = $1`, [item.target_id]);
    } else if (action === "remove") {
      await query(`update videos set status = 'archived' where id = $1`, [item.target_id]);
    } else if (action === "request-changes") {
      await query(`update videos set status = 'draft' where id = $1`, [item.target_id]);
    }
    if (action === "age-restrict") {
      await query(`update video_rights set age_rating = '18' where video_id = $1`, [item.target_id]);
    }
    if (action === "demonetise") {
      await query(`update video_pricing set access_models = array['free'] where video_id = $1`, [item.target_id]);
    }
  } else if (item.kind === "comment") {
    if (action === "approve") {
      await query(`update video_comments set status = 'published', held_reason = null where id = $1`, [item.target_id]);
    } else {
      await query(`update video_comments set status = 'removed', held_reason = $2 where id = $1`, [
        item.target_id,
        reason || "Removed by a moderator.",
      ]);
    }
  }
  // live/copyright/channel/campaign: no real backing system exists yet (live streaming,
  // copyright claims and ad campaigns are all still mock-only) — nothing real produces a
  // queue row of those kinds today, so there's nothing to apply here.

  await query(
    `update moderation_queue set status = 'actioned', assigned_to = coalesce(assigned_to, $2),
       notes = notes || $3 where id = $1`,
    [itemId, admin.name, reason ? `\n\nDecision: ${reason}` : ""],
  );

  const auditId = await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: "admin",
    action: `moderation.${action.replace(/-/g, "_")}`,
    targetType: item.kind,
    targetId: item.target_id,
    reason: reason || `${action} applied from the moderation queue.`,
    severity: action === "approve" ? "info" : action === "suspend" || action === "remove" ? "critical" : "warning",
  });

  return { outcome: "success", auditId, targetId: item.target_id };
}

/* -------------------------------- Audit log -------------------------------- */

export interface AuditEntry {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
  ip: string;
  severity: AuditSeverity;
}

interface AuditDbRow {
  id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
  ip: string | null;
  severity: AuditSeverity;
}

function mapAuditRow(row: AuditDbRow): AuditEntry {
  return {
    id: row.id,
    actor: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    createdAt: row.created_at,
    ip: row.ip ?? "",
    severity: row.severity,
  };
}

export async function recordAudit(input: {
  actorAccountId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  severity: AuditSeverity;
  ip?: string | null;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into audit_log (actor_account_id, actor_name, actor_role, action, target_type, target_id, reason, severity, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      input.actorAccountId,
      input.actorName,
      input.actorRole,
      input.action,
      input.targetType,
      input.targetId,
      input.reason,
      input.severity,
      input.ip ?? null,
    ],
  );
  return row!.id;
}

export async function listAuditLog(
  filters: { query?: string; severity?: AuditSeverity; targetType?: string } = {},
): Promise<AuditEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.severity) {
    params.push(filters.severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (filters.targetType) {
    params.push(filters.targetType);
    conditions.push(`target_type = $${params.length}`);
  }
  if (filters.query) {
    params.push(`%${filters.query.toLowerCase()}%`);
    const p = params.length;
    conditions.push(
      `(lower(action) like $${p} or lower(actor_name) like $${p} or lower(reason) like $${p} or lower(target_id) like $${p})`,
    );
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const rows = await query<AuditDbRow>(
    `select * from audit_log ${where} order by created_at desc limit 500`,
    params,
  );
  return rows.map(mapAuditRow);
}
