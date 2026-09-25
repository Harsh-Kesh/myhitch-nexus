// Partner API: POST /api/v1/partner/embed (TPI-9)
import { NextResponse, type NextRequest } from "next/server";
import { verifyApiKey } from "@/lib/server/enterprise";
import { queryOne } from "@/lib/server/db";
import { SITE_URL } from "@/lib/utils";

function getApiKeyFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey.trim();
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawKey = getApiKeyFromRequest(request);
  if (!rawKey) {
    return NextResponse.json(
      { error: "Unauthorized. Provide an API key via Bearer token or X-API-Key header." },
      { status: 401 },
    );
  }

  const auth = await verifyApiKey(rawKey);
  if (!auth.valid) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or expired API key." },
      { status: 401 },
    );
  }

  const scopes = auth.scopes ?? [];
  if (!scopes.includes("embed:player")) {
    return NextResponse.json(
      { error: "Forbidden. 'embed:player' scope is required for this endpoint." },
      { status: 403 },
    );
  }

  let body: {
    videoId?: string;
    allowedOrigins?: string[];
    theme?: "dark" | "light";
    autoPlay?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.videoId || typeof body.videoId !== "string") {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  // Only published content is embeddable — matches GET /api/v1/partner/videos's own
  // filter. Without this, a partner key could embed another channel's draft, private, or
  // restricted video simply by guessing/enumerating its id.
  const video = await queryOne<{ id: string; title: string }>(
    `select id, title from videos where id = $1 and status = 'published'`,
    [body.videoId],
  );

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const themeParam = body.theme === "light" ? "?theme=light" : "";
  const embedUrl = `${SITE_URL}/embed/${video.id}${themeParam}`;
  const iframeHtml = `<iframe src="${embedUrl}" title="${video.title.replace(/"/g, "&quot;")}" width="100%" height="100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;

  return NextResponse.json({
    videoId: video.id,
    embedUrl,
    iframeHtml,
    expiresAt: null,
  });
}
