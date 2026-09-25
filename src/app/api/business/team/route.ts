// GET & POST /api/business/team — Business Team Management & Invitations (Business Tier)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { NoOrganizationError, resolveOrgIdForAccount } from "@/lib/server/enterprise";
import { checkRateLimit } from "@/lib/server/rateLimit";
import {
  inviteTeamMember,
  listTeamMembers,
} from "@/lib/server/teamInvitations";

const INVITABLE_ROLES = ["editor", "analyst"] as const;

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await resolveOrgIdForAccount(account.id);
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 });
    }
    throw err;
  }

  const team = await listTeamMembers(orgId);
  return NextResponse.json(team);
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await resolveOrgIdForAccount(account.id);
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 });
    }
    throw err;
  }

  let body: {
    email?: string;
    role?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || !body.email.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  // Runtime-validated, not just TypeScript-typed — a client-supplied "owner" (or any
  // other string) must never reach inviteTeamMember(), which would otherwise insert it
  // verbatim into an unconstrained text column.
  if (body.role !== undefined && !INVITABLE_ROLES.includes(body.role as (typeof INVITABLE_ROLES)[number])) {
    return NextResponse.json({ error: "role must be 'editor' or 'analyst'." }, { status: 400 });
  }

  const rateLimit = await checkRateLimit(`team-invite:${account.id}`, 20, 60 * 60);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many invitations sent. Try again later." }, { status: 429 });
  }

  try {
    const result = await inviteTeamMember(
      orgId,
      account.id,
      body.email,
      (body.role as "editor" | "analyst" | undefined) ?? "editor",
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to invite team member";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
