// DELETE /api/business/team/invite/[id] — Revoke invitation
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { resolveOrgIdForAccount } from "@/lib/server/enterprise";
import { revokeInvitation } from "@/lib/server/teamInvitations";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const revoked = await revokeInvitation(id, orgId);
  return NextResponse.json({ success: revoked });
}
