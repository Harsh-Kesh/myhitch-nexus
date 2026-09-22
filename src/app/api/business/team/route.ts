// GET & POST /api/business/team — Business Team Management & Invitations (Business Tier)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { resolveOrgIdForAccount } from "@/lib/server/enterprise";
import {
  inviteTeamMember,
  listTeamMembers,
} from "@/lib/server/teamInvitations";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const team = await listTeamMembers(orgId);
  return NextResponse.json(team);
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const orgId = await resolveOrgIdForAccount(account.id);

  let body: {
    email?: string;
    role?: "editor" | "analyst";
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || !body.email.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    const result = await inviteTeamMember(
      orgId,
      account.id,
      body.email,
      body.role ?? "editor",
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
