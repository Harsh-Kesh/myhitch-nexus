// POST /api/admin/moderation/[id]/action — real counterpart of the mock's
// actionModerationItem(). Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { actionModerationItem, type ModerationAction } from "@/lib/server/moderation";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

const VALID_ACTIONS: ModerationAction[] = [
  "approve",
  "reject",
  "request-changes",
  "restrict",
  "demonetise",
  "geo-block",
  "age-restrict",
  "suspend",
  "remove",
];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["moderator", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: { action?: string; reason?: string; issueStrike?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.action || !VALID_ACTIONS.includes(body.action as ModerationAction)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const result = await actionModerationItem(
      { id: account.id, name: account.fullName, roles: account.roles },
      id,
      body.action as ModerationAction,
      body.reason?.trim() ?? "",
      { issueStrike: Boolean(body.issueStrike) },
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
    }
    if (result.outcome === "unsupported") {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }
    return NextResponse.json({
      audit: { id: result.auditId, targetId: result.targetId },
      strike: result.strike ?? null,
    });
  } catch (err) {
    console.error(`POST /api/admin/moderation/${id}/action failed`, err);
    return NextResponse.json({ error: "Failed to apply the decision." }, { status: 500 });
  }
}
