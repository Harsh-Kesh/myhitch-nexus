// POST /api/sponsorship/listings/[id]/withdraw — creator-initiated pull, any time before
// the listing is closed.
import { NextResponse, type NextRequest } from "next/server";
import { withdrawListing } from "@/lib/server/sponsorship";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const result = await withdrawListing(id, account.id);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      case "invalid_transition":
        return NextResponse.json({ error: "This listing can't be withdrawn." }, { status: 409 });
      case "success":
        return NextResponse.json(result.listing);
    }
  } catch (err) {
    console.error(`POST /api/sponsorship/listings/${id}/withdraw failed`, err);
    return NextResponse.json({ error: "Failed to withdraw the listing." }, { status: 500 });
  }
}
