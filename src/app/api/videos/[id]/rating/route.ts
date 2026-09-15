// GET/POST /api/videos/[id]/rating — the signed-in account's own rating for a video.
// Real videos only, same reasoning as the watchlist route.
import { NextResponse, type NextRequest } from "next/server";
import { videoExists } from "@/lib/server/catalogue";
import { getMyRating, rateVideo } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ stars: null });
  }
  const { id } = await params;
  const stars = await getMyRating(account.id, id);
  return NextResponse.json({ stars });
}

interface RateBody {
  stars?: number;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to rate this video." }, { status: 401 });
  }

  const { id } = await params;
  let body: RateBody;
  try {
    body = (await request.json()) as RateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const stars = body.stars;
  if (!Number.isInteger(stars) || stars! < 1 || stars! > 5) {
    return NextResponse.json({ error: "stars must be an integer from 1 to 5." }, { status: 400 });
  }

  if (!(await videoExists(id))) {
    return NextResponse.json(
      { error: "This title isn't in the real catalogue yet." },
      { status: 404 },
    );
  }

  const result = await rateVideo(account.id, id, stars as 1 | 2 | 3 | 4 | 5);
  return NextResponse.json(result);
}
