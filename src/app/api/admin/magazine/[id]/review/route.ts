// POST /api/admin/magazine/[id]/review — the editorial decision: publish, request
// changes, or reject. Admin-only. This is the human gate every real editorial system
// studied puts between "submitted" and "public" — see magazine.ts's header.
import { NextResponse, type NextRequest } from "next/server";
import { reviewArticle, type ReviewDecision } from "@/lib/server/magazine";
import { getRequestAccount } from "@/lib/server/rbac";

interface ReviewBody {
  decision?: string;
  notes?: string;
}

const VALID_DECISIONS: ReviewDecision[] = ["publish", "request_changes", "reject"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account || !account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.decision || !VALID_DECISIONS.includes(body.decision as ReviewDecision)) {
    return NextResponse.json({ error: "decision must be publish, request_changes or reject." }, { status: 400 });
  }

  try {
    const result = await reviewArticle(id, account.id, body.decision as ReviewDecision, body.notes?.trim() || null);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Article not found." }, { status: 404 });
      case "invalid_transition":
        return NextResponse.json({ error: "This article isn't awaiting review." }, { status: 409 });
      case "success":
        return NextResponse.json(result.article);
    }
  } catch (err) {
    console.error(`POST /api/admin/magazine/${id}/review failed`, err);
    return NextResponse.json({ error: "Failed to record the decision." }, { status: 500 });
  }
}
