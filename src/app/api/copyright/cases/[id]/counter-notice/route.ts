// POST /api/copyright/cases/[id]/counter-notice — the video's real owning account
// contests a claim. Requires membership on the case's channel (verified server-side, not
// merely self-asserted).
import { NextResponse, type NextRequest } from "next/server";
import { submitCounterNotice } from "@/lib/server/copyright";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { statement?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const statement = body.statement?.trim();
  if (!statement) {
    return NextResponse.json({ error: "A counter-notice statement is required." }, { status: 400 });
  }

  try {
    const result = await submitCounterNotice(account.id, id, statement);
    switch (result.outcome) {
      case "success":
        return NextResponse.json(result.case);
      case "not_found":
        return NextResponse.json({ error: "That case couldn't be found." }, { status: 404 });
      case "not_a_member":
        return NextResponse.json({ error: "You don't have access to that channel." }, { status: 403 });
      case "wrong_status":
        return NextResponse.json({ error: "This case already has a decision." }, { status: 409 });
    }
  } catch (err) {
    console.error(`POST /api/copyright/cases/${id}/counter-notice failed`, err);
    return NextResponse.json({ error: "Failed to submit the counter-notice." }, { status: 500 });
  }
}
