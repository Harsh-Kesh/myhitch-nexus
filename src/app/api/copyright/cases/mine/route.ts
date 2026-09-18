// GET /api/copyright/cases/mine — real cases against any channel the signed-in account
// belongs to. The only way a creator finds out they need to file a counter-notice, since
// no email/SMS provider is wired up yet (TPI-2).
import { NextResponse, type NextRequest } from "next/server";
import { listCopyrightCasesForAccount } from "@/lib/server/copyright";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const items = await listCopyrightCasesForAccount(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/copyright/cases/mine failed", err);
    return NextResponse.json({ error: "Failed to load copyright cases." }, { status: 500 });
  }
}
