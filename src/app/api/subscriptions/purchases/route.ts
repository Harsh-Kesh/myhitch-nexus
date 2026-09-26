// GET /api/subscriptions/purchases — real paid-invoice receipts for the signed-in
// account's own platform subscriptions (premium/family/business), backing both
// /account/subscriptions and (filtered to plan=business) /business/billing. Was built
// (listRealPlanPurchases()) but never wired to a route or any UI — see that function's
// own header for why it's per-invoice, not per-subscription.
import { NextResponse, type NextRequest } from "next/server";
import { listRealPlanPurchases } from "@/lib/server/subscriptions";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const items = await listRealPlanPurchases(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/subscriptions/purchases failed", err);
    return NextResponse.json({ error: "Failed to load purchase history." }, { status: 500 });
  }
}
