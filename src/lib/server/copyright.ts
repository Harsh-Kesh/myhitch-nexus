// Server-only. Real copyright notice-and-action (SEC-5). See the migration's own header
// comment (20260918000006_copyright_cases.sql) for the design reasoning — scoped to
// copyright only, reuses audit_log as the case timeline rather than a new notes table,
// and acts on a well-formed notice immediately (safe-harbor notice-and-action, not
// pre-adjudication) with a counter-notice path back.
import "server-only";
import { query, queryOne } from "./db";
import { recordAudit } from "./moderation";
import { describeAdminTier } from "./rbac";

export type CopyrightCaseStatus =
  | "open"
  | "counter-notice-received"
  | "escalated"
  | "upheld"
  | "rejected"
  | "restored";

export interface CopyrightCase {
  id: string;
  reference: string;
  videoId: string;
  videoTitle: string;
  channelId: string;
  channelName: string;
  status: CopyrightCaseStatus;
  claimantName: string;
  claimantEmail: string;
  claimantOrganization: string | null;
  workDescription: string;
  infringementDescription: string;
  counterNoticeStatement: string | null;
  counterNoticeSubmittedAt: string | null;
  restorationEligibleAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

interface CaseDbRow {
  id: string;
  reference: string;
  video_id: string;
  video_title: string;
  channel_id: string;
  channel_name: string;
  status: CopyrightCaseStatus;
  claimant_name: string;
  claimant_email: string;
  claimant_organization: string | null;
  work_description: string;
  infringement_description: string;
  counter_notice_statement: string | null;
  counter_notice_submitted_at: string | null;
  restoration_eligible_at: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
}

const CASE_SELECT = `
  select c.id, c.reference, c.video_id, v.title as video_title, c.channel_id, o.name as channel_name,
         c.status, c.claimant_name, c.claimant_email, c.claimant_organization,
         c.work_description, c.infringement_description,
         c.counter_notice_statement, c.counter_notice_submitted_at, c.restoration_eligible_at,
         c.decided_at, c.decision_reason, c.created_at
  from copyright_cases c
  join videos v on v.id = c.video_id
  join organizations o on o.id = c.channel_id
`;

function mapCase(row: CaseDbRow): CopyrightCase {
  return {
    id: row.id,
    reference: row.reference,
    videoId: row.video_id,
    videoTitle: row.video_title,
    channelId: row.channel_id,
    channelName: row.channel_name,
    status: row.status,
    claimantName: row.claimant_name,
    claimantEmail: row.claimant_email,
    claimantOrganization: row.claimant_organization,
    workDescription: row.work_description,
    infringementDescription: row.infringement_description,
    counterNoticeStatement: row.counter_notice_statement,
    counterNoticeSubmittedAt: row.counter_notice_submitted_at,
    restorationEligibleAt: row.restoration_eligible_at,
    decidedAt: row.decided_at,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
  };
}

/** Matches admin/reports page.tsx's own DECIDABLE_STATUSES — cases still needing a
 * decision, backing the admin dashboard's "Copyright claims" tile. */
const OPEN_CASE_STATUSES: CopyrightCaseStatus[] = ["open", "counter-notice-received", "escalated"];

export async function countOpenCopyrightCases(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `select count(*) as count from copyright_cases where status = any($1)`,
    [OPEN_CASE_STATUSES],
  );
  return Number(row?.count ?? 0);
}

export interface SubmitCopyrightClaimInput {
  videoId: string;
  claimantName: string;
  claimantEmail: string;
  claimantOrganization: string | null;
  workDescription: string;
  infringementDescription: string;
  goodFaithStatement: boolean;
  accuracyStatement: boolean;
}

export type SubmitCopyrightClaimResult =
  | { outcome: "success"; case: CopyrightCase }
  | { outcome: "video_not_found" }
  | { outcome: "statements_required" };

/** Acts immediately on a well-formed notice — restricts the video and opens a case —
 * rather than waiting for an admin to review first. That's what notice-and-action
 * safe-harbor actually means: the platform isn't adjudicating merits before acting, the
 * counter-notice is the uploader's real recourse if the claim is wrong. */
export async function submitCopyrightClaim(input: SubmitCopyrightClaimInput): Promise<SubmitCopyrightClaimResult> {
  if (!input.goodFaithStatement || !input.accuracyStatement) {
    return { outcome: "statements_required" };
  }
  const video = await queryOne<{ id: string; title: string; channel_id: string; status: string }>(
    `select id, title, channel_id, status from videos where id = $1`,
    [input.videoId],
  );
  if (!video) return { outcome: "video_not_found" };

  const seq = await queryOne<{ n: number }>(`select nextval('copyright_case_reference_seq') as n`);
  const reference = `COPY-${new Date().getFullYear()}-${String(seq!.n).padStart(6, "0")}`;

  const row = await queryOne<{ id: string }>(
    `insert into copyright_cases (
       reference, video_id, channel_id, status, claimant_name, claimant_email,
       claimant_organization, work_description, infringement_description,
       good_faith_statement, accuracy_statement
     ) values ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      reference,
      video.id,
      video.channel_id,
      input.claimantName,
      input.claimantEmail,
      input.claimantOrganization,
      input.workDescription,
      input.infringementDescription,
      input.goodFaithStatement,
      input.accuracyStatement,
    ],
  );
  const caseId = row!.id;

  await query(`update videos set status = 'restricted' where id = $1`, [video.id]);

  await query(
    `insert into moderation_queue (kind, target_id, title, channel_id, queue, priority, report_reasons, notes)
     values ('copyright', $1, $2, $3, 'copyright', 'high', $4, $5)`,
    [
      caseId,
      video.title,
      video.channel_id,
      [input.workDescription.slice(0, 120)],
      `Copyright claim ${reference} received from ${input.claimantName}${input.claimantOrganization ? ` (${input.claimantOrganization})` : ""}. Video restricted pending review.`,
    ],
  );

  await recordAudit({
    actorAccountId: null,
    actorName: input.claimantName,
    actorRole: "claimant",
    action: "copyright.claim_received",
    targetType: "copyright_case",
    targetId: caseId,
    reason: `${reference}: ${input.infringementDescription.slice(0, 200)}`,
    severity: "warning",
  });

  const created = await queryOne<CaseDbRow>(`${CASE_SELECT} where c.id = $1`, [caseId]);
  return { outcome: "success", case: mapCase(created!) };
}

export async function getCopyrightCase(caseId: string): Promise<CopyrightCase | null> {
  const row = await queryOne<CaseDbRow>(`${CASE_SELECT} where c.id = $1`, [caseId]);
  return row ? mapCase(row) : null;
}

export async function listCopyrightCasesForAdmin(): Promise<CopyrightCase[]> {
  const rows = await query<CaseDbRow>(`${CASE_SELECT} order by c.created_at desc`);
  return rows.map(mapCase);
}

/** Cases against any channel `accountId` is a member of — how a creator finds out they
 * need to file a counter-notice, since no email/SMS provider exists yet (TPI-2, still
 * unprovisioned) to notify them any other way. */
export async function listCopyrightCasesForAccount(accountId: string): Promise<CopyrightCase[]> {
  const rows = await query<CaseDbRow>(
    `${CASE_SELECT}
     where c.channel_id in (select organization_id from memberships where account_id = $1)
     order by c.created_at desc`,
    [accountId],
  );
  return rows.map(mapCase);
}

export type SubmitCounterNoticeResult =
  | { outcome: "success"; case: CopyrightCase }
  | { outcome: "not_found" }
  | { outcome: "not_a_member" }
  | { outcome: "wrong_status" };

const COUNTER_NOTICE_WINDOW_DAYS = 14;

export async function submitCounterNotice(
  accountId: string,
  caseId: string,
  statement: string,
): Promise<SubmitCounterNoticeResult> {
  const existing = await queryOne<{ channel_id: string; status: CopyrightCaseStatus }>(
    `select channel_id, status from copyright_cases where id = $1`,
    [caseId],
  );
  if (!existing) return { outcome: "not_found" };
  if (existing.status !== "open") return { outcome: "wrong_status" };

  const membership = await queryOne(
    `select 1 from memberships where account_id = $1 and organization_id = $2`,
    [accountId, existing.channel_id],
  );
  if (!membership) return { outcome: "not_a_member" };

  await query(
    `update copyright_cases set
       status = 'counter-notice-received',
       counter_notice_account_id = $2,
       counter_notice_statement = $3,
       counter_notice_submitted_at = now(),
       restoration_eligible_at = now() + interval '${COUNTER_NOTICE_WINDOW_DAYS} days'
     where id = $1`,
    [caseId, accountId, statement],
  );

  await recordAudit({
    actorAccountId: accountId,
    actorName: "",
    actorRole: "creator",
    action: "copyright.counter_notice_filed",
    targetType: "copyright_case",
    targetId: caseId,
    reason: statement.slice(0, 200),
    severity: "notice",
  });

  const updated = await queryOne<CaseDbRow>(`${CASE_SELECT} where c.id = $1`, [caseId]);
  return { outcome: "success", case: mapCase(updated!) };
}

export type CopyrightDecision = "reject-claim" | "uphold" | "escalate" | "restore";

export type DecideCopyrightCaseResult =
  | { outcome: "success"; case: CopyrightCase; strikeIssued: boolean; accountSuspended: boolean }
  | { outcome: "not_found" };

const STRIKE_SUSPENSION_THRESHOLD = 3;

/** The one place a copyright decision takes effect — mirrors actionModerationItem()'s
 * shape (look up, apply to the underlying video, write status + audit), but as its own
 * function since a copyright decision has real consequences (video restoration, a
 * strike, account suspension) that decision set doesn't share with any other
 * moderation-queue kind. */
export async function decideCopyrightCase(
  admin: { id: string; name: string; roles: string[] },
  caseId: string,
  decision: CopyrightDecision,
  reason: string,
): Promise<DecideCopyrightCaseResult> {
  const existing = await queryOne<{ video_id: string; channel_id: string }>(
    `select video_id, channel_id from copyright_cases where id = $1`,
    [caseId],
  );
  if (!existing) return { outcome: "not_found" };

  let newStatus: CopyrightCaseStatus;
  let strikeIssued = false;
  let accountSuspended = false;

  if (decision === "reject-claim") {
    newStatus = "rejected";
    await query(`update videos set status = 'published' where id = $1`, [existing.video_id]);
  } else if (decision === "restore") {
    newStatus = "restored";
    await query(`update videos set status = 'published' where id = $1`, [existing.video_id]);
  } else if (decision === "escalate") {
    newStatus = "escalated";
  } else {
    newStatus = "upheld";
    const owner = await queryOne<{ account_id: string }>(
      `select account_id from memberships where organization_id = $1 and org_role = 'owner' limit 1`,
      [existing.channel_id],
    );
    if (owner) {
      await query(`insert into copyright_strikes (account_id, copyright_case_id) values ($1, $2)`, [
        owner.account_id,
        caseId,
      ]);
      strikeIssued = true;
      const strikeCount = await queryOne<{ n: string }>(
        `select count(*) as n from copyright_strikes where account_id = $1`,
        [owner.account_id],
      );
      if (Number(strikeCount!.n) >= STRIKE_SUSPENSION_THRESHOLD) {
        await query(`update accounts set status = 'suspended' where id = $1`, [owner.account_id]);
        accountSuspended = true;
      }
    }
  }

  await query(
    `update copyright_cases set status = $2, decided_at = now(), decided_by = $3, decision_reason = $4 where id = $1`,
    [caseId, newStatus, admin.id, reason],
  );
  await query(`update moderation_queue set status = 'actioned' where kind = 'copyright' and target_id = $1`, [
    caseId,
  ]);

  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: describeAdminTier(admin.roles),
    action: `copyright.${decision.replace(/-/g, "_")}`,
    targetType: "copyright_case",
    targetId: caseId,
    reason: reason || `${decision} decided from the copyright case.`,
    severity: decision === "uphold" ? "critical" : decision === "reject-claim" ? "info" : "warning",
  });

  const updated = await queryOne<CaseDbRow>(`${CASE_SELECT} where c.id = $1`, [caseId]);
  return { outcome: "success", case: mapCase(updated!), strikeIssued, accountSuspended };
}
