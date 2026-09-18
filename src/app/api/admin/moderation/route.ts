// GET /api/admin/moderation — real counterpart of the mock's getModerationQueue().
// Admin-only. See docs/DEVELOPMENT-PLAN.md's 2026-09-17 admin-screens entry.
import { NextResponse, type NextRequest } from "next/server";
import { listModerationQueue, type ModerationQueueName } from "@/lib/server/moderation";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const queue = request.nextUrl.searchParams.get("queue") as ModerationQueueName | null;

  try {
    const items = await listModerationQueue(queue ?? undefined);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/moderation failed", err);
    return NextResponse.json({ error: "Failed to load the moderation queue." }, { status: 500 });
  }
}
