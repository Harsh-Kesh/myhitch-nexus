// POST /api/sponsorship/listings — create a new draft sponsorship listing on the signed-in
// account's own channel. GET — list every listing on channels this account belongs to.
import { NextResponse, type NextRequest } from "next/server";
import { createListing, getMyListings } from "@/lib/server/sponsorship";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  try {
    const items = await getMyListings(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/sponsorship/listings failed", err);
    return NextResponse.json({ error: "Failed to load your listings." }, { status: 500 });
  }
}

interface CreateBody {
  videoId?: string;
  projectName?: string;
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.channelId) {
    return NextResponse.json(
      { error: "You need a channel to publish a sponsorship listing." },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const projectName = body.projectName?.trim();
  if (!projectName || projectName.length < 3) {
    return NextResponse.json(
      { error: "A project name of at least 3 characters is required." },
      { status: 400 },
    );
  }

  try {
    const result = await createListing(account.id, {
      channelId: account.channelId,
      videoId: body.videoId?.trim() || null,
      projectName,
    });
    switch (result.outcome) {
      case "not_channel_member":
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      case "not_video_owner":
        return NextResponse.json(
          { error: "You can only link a video on your own channel." },
          { status: 403 },
        );
      case "success":
        return NextResponse.json(result.listing, { status: 201 });
    }
  } catch (err) {
    console.error("POST /api/sponsorship/listings failed", err);
    return NextResponse.json({ error: "Failed to create the listing." }, { status: 500 });
  }
}
