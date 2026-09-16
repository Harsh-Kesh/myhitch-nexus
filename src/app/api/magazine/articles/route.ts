// POST /api/magazine/articles — create a new draft magazine article about one of the
// signed-in account's own videos. GET — list the signed-in account's own articles
// (any status), newest-edited first.
import { NextResponse, type NextRequest } from "next/server";
import { createArticle, getMyArticles, ownsVideo } from "@/lib/server/magazine";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  try {
    const items = await getMyArticles(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/magazine/articles failed", err);
    return NextResponse.json({ error: "Failed to load your articles." }, { status: 500 });
  }
}

interface CreateBody {
  aboutTitle?: string;
  videoId?: string;
  title?: string;
  dek?: string;
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const aboutTitle = body.aboutTitle?.trim();
  const title = body.title?.trim();
  const videoId = body.videoId?.trim() || null;
  if (!aboutTitle || !title || title.length < 3) {
    return NextResponse.json(
      { error: "The film's name and an article title of at least 3 characters are required." },
      { status: 400 },
    );
  }

  try {
    // videoId is optional (see magazine.ts's header — real video publishing is still
    // mock, so most accounts have no real video to link), but if one IS supplied it must
    // genuinely belong to this account's own channel.
    if (videoId && !(await ownsVideo(account.id, videoId))) {
      return NextResponse.json(
        { error: "You can only link a video on your own channel." },
        { status: 403 },
      );
    }
    const article = await createArticle(account.id, {
      aboutTitle,
      videoId,
      title,
      dek: body.dek?.trim() ?? null,
    });
    return NextResponse.json(article, { status: 201 });
  } catch (err) {
    console.error("POST /api/magazine/articles failed", err);
    return NextResponse.json({ error: "Failed to create the article." }, { status: 500 });
  }
}
