import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { getLiveEventById } from "@/lib/server/liveEvents";
import { recordAudit } from "@/lib/server/moderation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account || !hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const event = await getLiveEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let body: { action: string; reason: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action, reason } = body;
  if (!reason || reason.trim().length < 8) {
    return NextResponse.json({ error: "Reason must be at least 8 characters" }, { status: 400 });
  }

  if (action === "terminate") {
    await query(`update live_events set status = 'ended', ended_at = now() where id = $1`, [id]);
  } else if (action === "disable-chat") {
    await query(`update live_events set chat_enabled = false where id = $1`, [id]);
  } else if (action === "age-gate") {
    await query(`update live_events set min_age_rating = '18+' where id = $1`, [id]);
  } else if (action === "warn") {
    await query(
      `insert into notifications (account_id, type, target_url, title, message)
       select m.account_id, 'system', '/studio/live', 'Warning from moderation', $1
       from memberships m
       where m.organization_id = $2`,
      [reason, event.channelId]
    );
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await recordAudit({
    actorAccountId: account.id,
    actorName: account.fullName,
    actorRole: "super-admin", // Simplified as we will collapse tiers
    action: `live_event.${action}`,
    targetType: "live_event",
    targetId: id,
    reason,
    severity: action === "terminate" ? "critical" : "warning",
  });

  return NextResponse.json({ success: true });
}
