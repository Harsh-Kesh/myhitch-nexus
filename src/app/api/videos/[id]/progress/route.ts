// GET/PUT /api/videos/[id]/progress — the signed-in account's watch progress on a video.
// Real videos only, same reasoning as the watchlist/rating routes.
import { NextResponse, type NextRequest } from "next/server";
import { getWatchProgress, saveWatchProgress } from "@/lib/server/engagement";
import { verifyOwnProfileId } from "@/lib/server/familyProfiles";
import { getRequestAccount } from "@/lib/server/rbac";
import { classifyDevice, countryFromHeaders, languageFromHeaders } from "@/lib/server/requestMeta";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ progress: null });
  }
  const { id } = await params;
  const profileId = await verifyOwnProfileId(account.id, request.nextUrl.searchParams.get("profileId"));
  const progress = await getWatchProgress(account.id, id, profileId);
  return NextResponse.json({ progress });
}

interface ProgressBody {
  positionSeconds?: number;
  profileId?: string;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to save watch progress." }, { status: 401 });
  }

  const { id } = await params;
  let body: ProgressBody;
  try {
    body = (await request.json()) as ProgressBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.positionSeconds !== "number" || !Number.isFinite(body.positionSeconds)) {
    return NextResponse.json({ error: "positionSeconds must be a number." }, { status: 400 });
  }

  const profileId = await verifyOwnProfileId(account.id, body.profileId);
  const progress = await saveWatchProgress(
    account.id,
    id,
    body.positionSeconds,
    {
      country: countryFromHeaders(request.headers),
      deviceType: classifyDevice(request.headers),
      language: languageFromHeaders(request.headers),
    },
    profileId,
  );
  if (!progress) {
    return NextResponse.json(
      { error: "This title isn't in the real catalogue yet." },
      { status: 404 },
    );
  }
  return NextResponse.json(progress);
}
