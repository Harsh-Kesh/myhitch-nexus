// GET /api/admin/sponsorship — the editorial review queue: every listing currently
// submitted and waiting on a decision. Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { getPendingReview } from "@/lib/server/sponsorship";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account || !account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    const items = await getPendingReview();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/sponsorship failed", err);
    return NextResponse.json({ error: "Failed to load the review queue." }, { status: 500 });
  }
}
