import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { getRequestAccount } from "@/lib/server/rbac";
import { verifyOwnProfileId } from "@/lib/server/familyProfiles";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json([], { status: 401 });

  const rows = await query(
    `SELECT id, event, title, body, href, read, created_at as "createdAt"
     FROM notifications
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [account.id]
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await query(
    `UPDATE notifications SET read = true WHERE account_id = $1`,
    [account.id]
  );
  return NextResponse.json({ success: true });
}
