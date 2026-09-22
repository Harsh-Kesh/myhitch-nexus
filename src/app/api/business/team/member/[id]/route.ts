// DELETE /api/business/team/member/[id] — Remove team member
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { resolveOrgIdForAccount } from "@/lib/server/enterprise";
import { removeTeamMember } from "@/lib/server/teamInvitations";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const removed = await removeTeamMember(id, orgId);
  return NextResponse.json({ success: removed });
}
