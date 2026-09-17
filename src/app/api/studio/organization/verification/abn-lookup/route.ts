// POST /api/studio/organization/verification/abn-lookup — the one automated, free check
// in organisation verification: the Australian Business Register's ABN Lookup web
// service. See src/lib/server/abnLookup.ts for the actual API call.
import { NextResponse, type NextRequest } from "next/server";
import { runAbnLookup } from "@/lib/server/organizationVerification";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { organizationId?: string; abn?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.organizationId || !body.abn) {
    return NextResponse.json({ error: "organizationId and abn are required." }, { status: 400 });
  }

  try {
    const result = await runAbnLookup(account.id, body.organizationId, body.abn);
    switch (result.outcome) {
      case "not_member":
        return NextResponse.json({ error: "You aren't a member of that organisation." }, { status: 403 });
      case "already_submitted":
        return NextResponse.json({ error: "This verification has already been submitted." }, { status: 409 });
      case "success":
        return NextResponse.json(result.result);
    }
  } catch (err) {
    console.error("POST /api/studio/organization/verification/abn-lookup failed", err);
    // Unlike most routes' generic 500 message, this surfaces the real cause (e.g. "ABN
    // Lookup isn't configured on this server") — every message abnLookup.ts/this path
    // can throw is developer-authored and safe to show, and a misconfigured env var vs.
    // a genuine ABR outage are two very different things to act on, worth telling apart
    // without needing server log access.
    const message = err instanceof Error ? err.message : "ABN Lookup failed. Try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
