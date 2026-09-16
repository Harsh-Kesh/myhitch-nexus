// GET /api/sponsorship/listings/[id]/inquiries — every inquiry received on a listing this
// account's channel owns (sponsor identity + message). POST — a signed-in business/
// advertiser account expresses interest in a published listing.
import { NextResponse, type NextRequest } from "next/server";
import { createInquiry, getInquiriesForListing } from "@/lib/server/sponsorship";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const items = await getInquiriesForListing(id, account.id);
    if (items === null) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    return NextResponse.json({ items });
  } catch (err) {
    console.error(`GET /api/sponsorship/listings/${id}/inquiries failed`, err);
    return NextResponse.json({ error: "Failed to load inquiries." }, { status: 500 });
  }
}

// Gated to business/advertiser accounts, per the research's spam-reduction recommendation
// — a real, role-bearing account is a much higher bar than an anonymous contact form.
const SPONSOR_ROLES = ["business", "advertiser"];

interface CreateBody {
  message?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.some((role) => SPONSOR_ROLES.includes(role))) {
    return NextResponse.json(
      { error: "A business or advertiser account is required to express interest." },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message || message.length < 10) {
    return NextResponse.json(
      { error: "A short message (at least 10 characters) is required." },
      { status: 400 },
    );
  }

  try {
    const result = await createInquiry(id, account.id, message);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Listing not found or no longer published." }, { status: 404 });
      case "success":
        return NextResponse.json(result.inquiry, { status: 201 });
    }
  } catch (err) {
    console.error(`POST /api/sponsorship/listings/${id}/inquiries failed`, err);
    return NextResponse.json({ error: "Failed to send your inquiry." }, { status: 500 });
  }
}
