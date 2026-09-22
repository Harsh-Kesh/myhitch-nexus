// GET /api/admin/audit-log — real counterpart of the mock's getAuditLog(). Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { listAuditLog, type AuditSeverity } from "@/lib/server/moderation";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["moderator", "finance-admin", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  // Full trail for super-admin; a moderator/finance-admin sees only their own action
  // history — docs/openapi.yaml's documented scope for this endpoint.
  const isSuperAdmin = hasAnyRole(account, ["super-admin"]);

  const { searchParams } = request.nextUrl;
  try {
    const items = await listAuditLog({
      query: searchParams.get("query") ?? undefined,
      severity: (searchParams.get("severity") as AuditSeverity | null) ?? undefined,
      targetType: searchParams.get("targetType") ?? undefined,
      actorAccountId: isSuperAdmin ? undefined : account.id,
    });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/audit-log failed", err);
    return NextResponse.json({ error: "Failed to load the audit log." }, { status: 500 });
  }
}
