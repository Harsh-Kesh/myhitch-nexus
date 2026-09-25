// DELETE /api/business/team/member/[id] — Remove team member
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { NoOrganizationError, resolveOrgIdForAccount } from "@/lib/server/enterprise";
import { removeTeamMember } from "@/lib/server/teamInvitations";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  try {
    const removed = await removeTeamMember(id, orgId, account.id);
    return NextResponse.json({ success: removed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove team member";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
