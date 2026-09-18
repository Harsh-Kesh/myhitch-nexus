// POST /api/admin/copyright-cases/[id]/action — the real decision point: reject the
// claim (restore), uphold it (strike, possible suspension), escalate (legal review), or
// restore after an uncontested counter-notice window. Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { decideCopyrightCase, type CopyrightDecision } from "@/lib/server/copyright";
import { getRequestAccount } from "@/lib/server/rbac";

const VALID_DECISIONS: CopyrightDecision[] = ["reject-claim", "uphold", "escalate", "restore"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { decision?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.decision || !VALID_DECISIONS.includes(body.decision as CopyrightDecision)) {
    return NextResponse.json({ error: `decision must be one of: ${VALID_DECISIONS.join(", ")}` }, { status: 400 });
  }

  try {
    const result = await decideCopyrightCase(
      { id: account.id, name: account.fullName },
      id,
      body.decision as CopyrightDecision,
      body.reason?.trim() ?? "",
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "That case couldn't be found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error(`POST /api/admin/copyright-cases/${id}/action failed`, err);
    return NextResponse.json({ error: "Failed to decide the case." }, { status: 500 });
  }
}
