// POST /api/integrations/lens/status — webhook Lens calls once it has reviewed a
// submission (see lensIntegration.ts's header for the full proposed contract). This is
// the one place a Magazine article's status moves to "published"/"rejected" — that
// decision is Lens's, not Nexus admin's, per docs/DEVELOPMENT-PLAN.md's 2026-09-16
// correction entry.
//
// Auth: a shared bearer secret (LENS_API_KEY), the same value Nexus sends as the
// Authorization header on its own outbound submission call — a plain equality check is
// this project's established bar for a low-value secret shared between two in-house
// platforms (see Sentry's DSN handling, also a plain env var).
import { NextResponse, type NextRequest } from "next/server";
import { applyLensDecision, type LensDecision } from "@/lib/server/magazine";

const VALID_DECISIONS: LensDecision[] = ["published", "rejected", "changes_requested"];

interface LensStatusBody {
  lensSubmissionId?: string;
  status?: string;
  lensUrl?: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.LENS_API_KEY;
  const authHeader = request.headers.get("authorization");
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: LensStatusBody;
  try {
    body = (await request.json()) as LensStatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.lensSubmissionId) {
    return NextResponse.json({ error: "lensSubmissionId is required." }, { status: 400 });
  }
  if (!body.status || !VALID_DECISIONS.includes(body.status as LensDecision)) {
    return NextResponse.json({ error: "status must be published, rejected or changes_requested." }, { status: 400 });
  }

  try {
    const article = await applyLensDecision(
      body.lensSubmissionId,
      body.status as LensDecision,
      body.lensUrl?.trim() || null,
      body.reason?.trim() || null,
    );
    if (!article) {
      return NextResponse.json({ error: "No article found for that lensSubmissionId." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/integrations/lens/status failed", err);
    return NextResponse.json({ error: "Failed to record Lens's decision." }, { status: 500 });
  }
}
