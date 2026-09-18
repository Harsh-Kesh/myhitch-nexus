// GET /api/videos/[id]/entitlement — real purchase/rental/PPV entitlement check for the
// signed-in account, called from within the mock's getEntitlement() (see its header
// comment) once the video and requester are both real. Free/ad-supported/geo/owner
// checks stay in getEntitlement() itself, since those already work correctly against
// real video data — this route only answers the one part that needed a real backing
// table: "did this account actually buy/rent/unlock this video?"
import { NextResponse, type NextRequest } from "next/server";
import { checkRealEntitlement } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ granted: false });
  }
  const { id } = await params;

  try {
    const result = await checkRealEntitlement(account.id, id);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`GET /api/videos/${id}/entitlement failed`, err);
    return NextResponse.json({ granted: false });
  }
}
