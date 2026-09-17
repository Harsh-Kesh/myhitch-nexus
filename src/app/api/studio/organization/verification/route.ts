// GET/PATCH /api/studio/organization/verification — the free half of organisation
// verification (docs/DEVELOPMENT-PLAN.md's 2026-09-17 entry). GET reads the current
// draft/submission; PATCH saves a work-in-progress draft (no completeness gate — that's
// submitVerification()'s job, at POST .../submit).
import { NextResponse, type NextRequest } from "next/server";
import {
  getVerification,
  saveVerificationDraft,
  type VerificationDraftInput,
} from "@/lib/server/organizationVerification";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await getVerification(account.id, organizationId);
    if (result.outcome === "not_member") {
      return NextResponse.json({ error: "You aren't a member of that organisation." }, { status: 403 });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    console.error("GET /api/studio/organization/verification failed", err);
    return NextResponse.json({ error: "Failed to load verification details." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { organizationId?: string } & VerificationDraftInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { organizationId, ...draft } = body;
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await saveVerificationDraft(account.id, organizationId, draft);
    switch (result.outcome) {
      case "not_member":
        return NextResponse.json({ error: "You aren't a member of that organisation." }, { status: 403 });
      case "already_submitted":
        return NextResponse.json({ error: "This verification has already been submitted." }, { status: 409 });
      case "success":
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("PATCH /api/studio/organization/verification failed", err);
    return NextResponse.json({ error: "Failed to save your changes." }, { status: 500 });
  }
}
