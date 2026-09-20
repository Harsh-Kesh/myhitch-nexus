// GET /api/purchases — real counterpart of the mock's getPurchases(), for
// /account/billing. Real accounts only.
import { NextResponse, type NextRequest } from "next/server";
import { listRealPurchases } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const items = await listRealPurchases(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/purchases failed", err);
    return NextResponse.json({ error: "Failed to load purchases." }, { status: 500 });
  }
}
