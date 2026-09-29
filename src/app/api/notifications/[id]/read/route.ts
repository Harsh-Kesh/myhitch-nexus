import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { getRequestAccount } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { id } = await params;

  await query(
    `UPDATE notifications SET read = true WHERE id = $1 AND account_id = $2`,
    [id, account.id]
  );
  return NextResponse.json({ success: true });
}
