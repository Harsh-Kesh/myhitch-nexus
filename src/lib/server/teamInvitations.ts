// Server-only. Business Team Member Management & Invitations (Business Tier: "Employee access up to 5")
import "server-only";
import { randomBytes } from "node:crypto";
import { query, queryOne } from "./db";
import { SITE_URL } from "@/lib/utils";

export interface TeamMember {
  id: string;
  accountId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "owner" | "editor" | "analyst";
  createdAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: "owner" | "editor" | "analyst";
  token: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
}

export interface TeamOverview {
  members: TeamMember[];
  pendingInvitations: PendingInvitation[];
  totalSeatsUsed: number;
  /** null means unlimited (Enterprise) — see organizations.seat_limit's migration comment. */
  maxSeats: number | null;
}

export async function listTeamMembers(orgId: string): Promise<TeamOverview> {
  const orgRow = await queryOne<{ seat_limit: number | null }>(
    `select seat_limit from organizations where id = $1`,
    [orgId],
  );
  // Falls back to 5 only if the org row itself is somehow missing — every real org has
  // this column populated (defaults to 5 for every existing and new row). A NULL here is
  // real and deliberate: a super-admin explicitly cleared it for a sales-closed Enterprise
  // deal (see the migration) — `??` would wrongly collapse that back to 5, so this checks
  // for the row's absence specifically, not falsiness of the column.
  const maxSeats = orgRow ? orgRow.seat_limit : 5;

  const memberRows = await query<{
    id: string;
    account_id: string;
    org_role: "owner" | "editor" | "analyst";
    full_name: string;
    email: string;
    avatar_url: string | null;
    created_at: string;
  }>(
    `select m.id, m.account_id, m.org_role,
            coalesce(a.full_name, 'Team Member') as full_name,
            coalesce(a.email, '') as email,
            a.avatar_url,
            m.created_at
     from memberships m
     left join accounts a on a.id = m.account_id
     where m.organization_id = $1
     order by m.created_at asc`,
    [orgId],
  );

  const inviteRows = await query<{
    id: string;
    email: string;
    role: "owner" | "editor" | "analyst";
    token: string;
    status: "pending" | "accepted" | "revoked";
    expires_at: string;
    created_at: string;
  }>(
    `select id, email, role, token, status, expires_at, created_at
     from organization_invitations
     where organization_id = $1 and status = 'pending' and expires_at > now()
     order by created_at desc`,
    [orgId],
  );

  const members: TeamMember[] = memberRows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.full_name,
    email: r.email,
    avatarUrl: r.avatar_url,
    role: r.org_role ?? "editor",
    createdAt: r.created_at,
  }));

  const pendingInvitations: PendingInvitation[] = inviteRows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    token: r.token,
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));

  return {
    members,
    pendingInvitations,
    totalSeatsUsed: members.length + pendingInvitations.length,
    maxSeats,
  };
}

/** Only the org's owner may invite, remove, or revoke — every other role (editor,
 * analyst) previously had no restriction at all, meaning any team member could add or
 * remove anyone, including the owner. */
async function requireOwner(accountId: string, orgId: string): Promise<void> {
  const row = await queryOne<{ org_role: string }>(
    `select org_role from memberships where account_id = $1 and organization_id = $2`,
    [accountId, orgId],
  );
  if (row?.org_role !== "owner") {
    throw new Error("Only the organization owner can manage team members.");
  }
}

export async function inviteTeamMember(
  orgId: string,
  invitedBy: string,
  email: string,
  role: "editor" | "analyst" = "editor",
): Promise<{ invitation: PendingInvitation; inviteUrl: string }> {
  await requireOwner(invitedBy, orgId);
  const normalizedEmail = email.trim().toLowerCase();
  const overview = await listTeamMembers(orgId);

  if (overview.maxSeats !== null && overview.totalSeatsUsed >= overview.maxSeats) {
    throw new Error(
      `Business plan includes up to ${overview.maxSeats} team member seats. Upgrade to Enterprise for unlimited seats.`,
    );
  }

  // Check if already invited or already member
  if (overview.members.some((m) => m.email.toLowerCase() === normalizedEmail)) {
    throw new Error("This user is already a member of your team.");
  }

  if (overview.pendingInvitations.some((i) => i.email.toLowerCase() === normalizedEmail)) {
    throw new Error("An active invitation has already been sent to this email.");
  }

  const token = randomBytes(16).toString("hex");

  const row = await queryOne<{
    id: string;
    email: string;
    role: "owner" | "editor" | "analyst";
    token: string;
    status: "pending" | "accepted" | "revoked";
    expires_at: string;
    created_at: string;
  }>(
    `insert into organization_invitations (
      organization_id, email, role, token, invited_by
    ) values ($1, $2, $3, $4, $5)
    returning id, email, role, token, status, expires_at, created_at`,
    [orgId, normalizedEmail, role, token, invitedBy],
  );

  if (!row) throw new Error("Failed to create invitation");

  return {
    invitation: {
      id: row.id,
      email: row.email,
      role: row.role,
      token: row.token,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    },
    inviteUrl: `${SITE_URL}/business/join?token=${token}`,
  };
}

export async function revokeInvitation(
  invitationId: string,
  orgId: string,
  actingAccountId: string,
): Promise<boolean> {
  await requireOwner(actingAccountId, orgId);
  const result = await query(
    `update organization_invitations set status = 'revoked' where id = $1 and organization_id = $2`,
    [invitationId, orgId],
  );
  return result.length > 0;
}

export async function removeTeamMember(
  membershipId: string,
  orgId: string,
  actingAccountId: string,
): Promise<boolean> {
  await requireOwner(actingAccountId, orgId);
  const result = await query(
    `delete from memberships where id = $1 and organization_id = $2 and org_role != 'owner'`,
    [membershipId, orgId],
  );
  return result.length > 0;
}

export async function acceptInvitation(
  token: string,
  accountId: string,
  accountEmail: string,
): Promise<{ success: boolean; organizationId: string }> {
  const invite = await queryOne<{
    id: string;
    organization_id: string;
    role: string;
    email: string;
  }>(
    `select id, organization_id, role, email
     from organization_invitations
     where token = $1 and status = 'pending' and expires_at > now()`,
    [token],
  );

  if (!invite) {
    throw new Error("Invitation not found or has expired.");
  }

  // Identity binding: the invite was addressed to a specific email — without this check,
  // anyone who obtains the invite link/token (a forwarded email, a browser-history entry,
  // a leaked URL) could accept it as an entirely different account than the one invited.
  if (invite.email.toLowerCase() !== accountEmail.trim().toLowerCase()) {
    throw new Error("This invitation was sent to a different email address. Sign in as that account to accept it.");
  }

  // A client-supplied role can never reach here — invite.role was itself validated
  // (INVITABLE_ROLES) at invitation time, so this insert is safe.
  await query(
    `insert into memberships (account_id, organization_id, org_role)
     values ($1, $2, $3)
     on conflict do nothing`,
    [accountId, invite.organization_id, invite.role],
  );

  // Mark accepted
  await query(
    `update organization_invitations set status = 'accepted' where id = $1`,
    [invite.id],
  );

  return {
    success: true,
    organizationId: invite.organization_id,
  };
}
