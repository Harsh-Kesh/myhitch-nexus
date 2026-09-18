// GET /api/channels/[id]/membership-tier — public: a viewer needs the real price to show
// in the purchase modal before ever signing in. PUT — the channel's own creator-side
// configuration, restricted to accounts with a membership on this organization, same bar
// as PATCH /api/channels/[id].
import { NextResponse, type NextRequest } from "next/server";
import { getMembershipTier, setMembershipTier } from "@/lib/server/channelMemberships";
import { isChannelMember } from "@/lib/server/channelSettings";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const tier = await getMembershipTier(id);
    return NextResponse.json(tier);
  } catch (err) {
    console.error(`GET /api/channels/${id}/membership-tier failed`, err);
    return NextResponse.json({ error: "Failed to load membership tier." }, { status: 500 });
  }
}

interface MembershipTierPatch {
  priceMinor?: number;
  currency?: string;
  benefits?: string[];
  isEnabled?: boolean;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!(await isChannelMember(account.id, id))) {
    return NextResponse.json({ error: "You don't have access to this channel." }, { status: 403 });
  }

  let body: MembershipTierPatch;
  try {
    body = (await request.json()) as MembershipTierPatch;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.priceMinor !== "number" || typeof body.isEnabled !== "boolean") {
    return NextResponse.json({ error: "priceMinor and isEnabled are required." }, { status: 400 });
  }

  try {
    const result = await setMembershipTier(id, {
      priceMinor: body.priceMinor,
      currency: body.currency ?? "GBP",
      benefits: Array.isArray(body.benefits) ? body.benefits : [],
      isEnabled: body.isEnabled,
    });
    if (result.outcome === "invalid_price") {
      return NextResponse.json({ error: "Price must be a whole number of minor units greater than 0." }, { status: 400 });
    }
    return NextResponse.json(result.tier);
  } catch (err) {
    console.error(`PUT /api/channels/${id}/membership-tier failed`, err);
    return NextResponse.json({ error: "Failed to save membership tier." }, { status: 500 });
  }
}
