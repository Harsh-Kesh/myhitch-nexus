// POST /api/sponsorship/listings/[id]/submit — sends a draft (or a listing sent back for
// changes) into the editorial review queue.
import { NextResponse, type NextRequest } from "next/server";
import { submitListing } from "@/lib/server/sponsorship";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const result = await submitListing(id, account.id);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      case "invalid_transition":
        return NextResponse.json(
          {
            error:
              "Add a bit more before submitting — at least a few sentences of pitch and one reward you're offering.",
          },
          { status: 409 },
        );
      case "success":
        return NextResponse.json(result.listing);
    }
  } catch (err) {
    console.error(`POST /api/sponsorship/listings/${id}/submit failed`, err);
    return NextResponse.json({ error: "Failed to submit the listing." }, { status: 500 });
  }
}
