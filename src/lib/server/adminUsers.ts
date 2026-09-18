// Server-only. Real user management for /admin/users — accounts/account_roles already
// existed; nothing admin-facing ever read or wrote them for real until now (see
// docs/DEVELOPMENT-PLAN.md's 2026-09-17 admin-screens entry). "Flags" is derived from
// open moderation_queue items against the account's own channel rather than a stored
// counter, so it can never drift from the queue itself.
import "server-only";
import { query } from "./db";
import { recordAudit } from "./moderation";
import { toDbRole, toMockRoles } from "./rbac";
import { revokeAccountSessions } from "./session";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: "active" | "pending" | "suspended" | "closed";
  country: string;
  createdAt: string;
  lastActiveAt: string;
  channelId?: string;
  flags: number;
}

interface AdminUserDbRow {
  id: string;
  full_name: string;
  email: string;
  status: AdminUserRow["status"];
  country: string | null;
  created_at: string;
  last_active_at: string;
  channel_id: string | null;
  flags: string;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const rows = await query<AdminUserDbRow>(
    `select
       a.id, a.full_name, a.email, a.status, a.country, a.created_at,
       coalesce((select max(s.created_at) from sessions s where s.account_id = a.id), a.created_at) as last_active_at,
       (select m.organization_id from memberships m where m.account_id = a.id order by m.created_at asc limit 1) as channel_id,
       coalesce((
         select count(*) from moderation_queue mq
         where mq.status = 'open'
           and mq.channel_id = (select m.organization_id from memberships m where m.account_id = a.id order by m.created_at asc limit 1)
       ), 0) as flags
     from accounts a
     order by a.created_at desc`,
  );
  const roleRows = await query<{ account_id: string; role: string }>(
    `select account_id, role from account_roles`,
  );
  const rolesByAccount = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = rolesByAccount.get(r.account_id) ?? [];
    list.push(r.role);
    rolesByAccount.set(r.account_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.full_name,
    email: row.email,
    roles: toMockRoles(rolesByAccount.get(row.id) ?? []),
    status: row.status,
    country: row.country ?? "—",
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    channelId: row.channel_id ?? undefined,
    flags: Number(row.flags),
  }));
}

export async function updateAdminUserRoles(
  admin: { id: string; name: string },
  targetAccountId: string,
  mockRoles: string[],
): Promise<void> {
  const dbRoles = mockRoles.map(toDbRole);
  await query(`delete from account_roles where account_id = $1`, [targetAccountId]);
  for (const role of dbRoles) {
    await query(`insert into account_roles (account_id, role) values ($1, $2) on conflict do nothing`, [
      targetAccountId,
      role,
    ]);
  }
  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: "admin",
    action: "user.roles_updated",
    targetType: "user",
    targetId: targetAccountId,
    reason: `Roles set to: ${mockRoles.join(", ")}.`,
    severity: "notice",
  });
}

export async function updateAdminUserStatus(
  admin: { id: string; name: string },
  targetAccountId: string,
  status: AdminUserRow["status"],
  reason: string,
): Promise<void> {
  await query(`update accounts set status = $2 where id = $1`, [targetAccountId, status]);
  // Suspending/closing an account is meaningless unless it actually ends their current
  // session too — otherwise it's a status label with no real effect, the same "honest
  // state over fake success" gap this whole slice exists to close.
  if (status === "suspended" || status === "closed") {
    await revokeAccountSessions(targetAccountId);
  }
  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: "admin",
    action: `user.${status}`,
    targetType: "user",
    targetId: targetAccountId,
    reason,
    severity: status === "suspended" ? "critical" : "notice",
  });
}
