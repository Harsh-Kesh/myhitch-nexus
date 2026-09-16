// GET /api/sponsorship/listings/[id] — one listing on a channel this account belongs to,
// any status. PATCH — edit the working draft (pitch/video/project name/rewards) while
// it's still editable.
import { NextResponse, type NextRequest } from "next/server";
import { getListingById, REWARD_TYPES, updateDraftListing, type RewardType } from "@/lib/server/sponsorship";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const listing = await getListingById(id);
    if (!listing || listing.channelId !== account.channelId) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    return NextResponse.json(listing);
  } catch (err) {
    console.error(`GET /api/sponsorship/listings/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load the listing." }, { status: 500 });
  }
}

interface PatchBody {
  projectName?: string;
  pitchHtml?: string;
  videoId?: string | null;
  rewardTypes?: RewardType[];
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.rewardTypes && !body.rewardTypes.every((reward) => (REWARD_TYPES as readonly string[]).includes(reward))) {
    return NextResponse.json({ error: "Unrecognized reward type." }, { status: 400 });
  }

  try {
    const result = await updateDraftListing(id, account.id, body);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      case "not_editable":
        return NextResponse.json(
          { error: "This listing can't be edited once it's submitted or published." },
          { status: 409 },
        );
      case "not_video_owner":
        return NextResponse.json(
          { error: "You can only link a video on your own channel." },
          { status: 403 },
        );
      case "success":
        return NextResponse.json(result.listing);
    }
  } catch (err) {
    console.error(`PATCH /api/sponsorship/listings/${id} failed`, err);
    return NextResponse.json({ error: "Failed to save changes." }, { status: 500 });
  }
}
