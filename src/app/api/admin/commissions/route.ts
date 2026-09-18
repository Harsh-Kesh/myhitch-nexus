// GET/POST /api/admin/commissions — real commission-rate config for /admin/settings'
// Commissions tab. Admin-only. A POST inserts a new rate (never updates in place — see
// commissions.ts's setCommissionRate() header comment).
import { NextResponse, type NextRequest } from "next/server";
import { listCommissionRates, setCommissionRate, type CommissionScope } from "@/lib/server/commissions";
import { recordAudit } from "@/lib/server/moderation";
import { getRequestAccount } from "@/lib/server/rbac";

const VALID_SCOPES: CommissionScope[] = ["purchase_rental", "ppv", "membership"];

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const items = await listCommissionRates();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/commissions failed", err);
    return NextResponse.json({ error: "Failed to load commission rates." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { scope?: string; platformSharePct?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.scope || !VALID_SCOPES.includes(body.scope as CommissionScope)) {
    return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
  }
  if (typeof body.platformSharePct !== "number" || body.platformSharePct < 0 || body.platformSharePct > 100) {
    return NextResponse.json({ error: "platformSharePct must be between 0 and 100." }, { status: 400 });
  }

  try {
    const rate = await setCommissionRate(body.scope as CommissionScope, body.platformSharePct);
    await recordAudit({
      actorAccountId: account.id,
      actorName: account.fullName,
      actorRole: "admin",
      action: "config.commission_rate_set",
      targetType: "commission_rate",
      targetId: rate.id,
      reason: `${rate.scope} platform share set to ${rate.platformSharePct}%, effective now.`,
      severity: "notice",
    });
    return NextResponse.json(rate);
  } catch (err) {
    console.error("POST /api/admin/commissions failed", err);
    return NextResponse.json({ error: "Failed to set the commission rate." }, { status: 500 });
  }
}
