// POST /api/videos/[id]/report — a real, reasoned report into moderation_queue's
// 'reported' queue. Real videos only, same reasoning as the rating/watchlist routes.
import { NextResponse, type NextRequest } from "next/server";
import { reportVideo } from "@/lib/server/moderation";
import { getRequestAccount } from "@/lib/server/rbac";

const REPORT_REASONS = [
  "spam-misleading",
  "sexual-content",
  "violent-graphic",
  "hateful-abusive",
  "harmful-dangerous-acts",
  "child-safety",
  "copyright",
  "other",
] as const;

interface ReportBody {
  reason?: string;
  details?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to report a video." }, { status: 401 });
  }

  const { id } = await params;
  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.reason || !(REPORT_REASONS as readonly string[]).includes(body.reason)) {
    return NextResponse.json({ error: "Choose a reason for the report." }, { status: 400 });
  }

  const result = await reportVideo(id, body.reason, body.details);
  if (result.outcome === "not_found") {
    return NextResponse.json(
      { error: "This title isn't in the real catalogue yet." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
