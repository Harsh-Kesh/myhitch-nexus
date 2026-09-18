// GET /api/subscriptions — real counterpart of the mock's getSubscriptions(), for
// /account/subscriptions. Real accounts only.
import { NextResponse, type NextRequest } from "next/server";
import { listRealSubscriptions } from "@/lib/server/subscriptions";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const items = await listRealSubscriptions(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/subscriptions failed", err);
    return NextResponse.json({ error: "Failed to load subscriptions." }, { status: 500 });
  }
}
