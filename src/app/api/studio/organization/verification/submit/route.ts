// POST /api/studio/organization/verification/submit — the server-enforced completeness
// gate (same spirit as publishVideo()'s AC-3 gate): moves organizations.verification_status
// from 'unverified' to 'pending' only once required fields and every declaration
// checkbox are present. Never sets 'verified' itself — nothing here can actually confirm
// a business is legitimate yet (ID/bank/risk checks are deferred, paid vendors).
import { NextResponse, type NextRequest } from "next/server";
import { submitVerification } from "@/lib/server/organizationVerification";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { organizationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await submitVerification(account.id, body.organizationId);
    switch (result.outcome) {
      case "not_member":
        return NextResponse.json({ error: "You aren't a member of that organisation." }, { status: 403 });
      case "already_submitted":
        return NextResponse.json({ error: "This verification has already been submitted." }, { status: 409 });
      case "invalid":
        return NextResponse.json({ error: result.reason }, { status: 400 });
      case "success":
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("POST /api/studio/organization/verification/submit failed", err);
    return NextResponse.json({ error: "Failed to submit for verification." }, { status: 500 });
  }
}
