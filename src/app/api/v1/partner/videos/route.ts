// Partner API: GET & POST /api/v1/partner/videos (TPI-9)
import { NextResponse, type NextRequest } from "next/server";
import { verifyApiKey } from "@/lib/server/enterprise";
import { query, queryOne } from "@/lib/server/db";
import { SITE_URL, slugify } from "@/lib/utils";

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

export async function GET(request: NextRequest) {
  const rawKey = getApiKeyFromRequest(request);
  if (!rawKey) {
    return NextResponse.json(
      { error: "Unauthorized. Provide an API key via Bearer token or X-API-Key header." },
      { status: 401 },
    );
  }

  const auth = await verifyApiKey(rawKey);
  if (!auth.valid || !auth.orgId) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or expired API key." },
      { status: 401 },
    );
  }

  const scopes = auth.scopes ?? [];
  if (!scopes.includes("read:catalogue") && !scopes.includes("admin")) {
    return NextResponse.json(
      { error: "Forbidden. 'read:catalogue' scope is required for this endpoint." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)), 100);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const search = searchParams.get("search")?.trim();

  let whereClause = `v.status = 'published'`;
  const queryParams: unknown[] = [];

  // Filter by org's own channel if org has specific videos, or allow catalogue browsing
  if (search) {
    queryParams.push(`%${search}%`);
    whereClause += ` and (v.title ilike $${queryParams.length} or v.synopsis ilike $${queryParams.length})`;
  }

  const countRow = await queryOne<{ count: string }>(
    `select count(*) as count from videos v where ${whereClause}`,
    queryParams,
  );
  const total = parseInt(countRow?.count ?? "0", 10);

  queryParams.push(limit);
  const limitIdx = queryParams.length;
  queryParams.push(offset);
  const offsetIdx = queryParams.length;

  const rows = await query<{
    id: string;
    title: string;
    synopsis: string | null;
    duration_seconds: number;
    thumbnail_url: string | null;
    content_type: string;
    published_at: string | null;
  }>(
    `select v.id, v.title, v.synopsis, v.duration_seconds, v.thumbnail_url, v.content_type, v.published_at
     from videos v
     where ${whereClause}
     order by v.published_at desc nulls last, v.created_at desc
     limit $${limitIdx} offset $${offsetIdx}`,
    queryParams,
  );

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    synopsis: r.synopsis,
    durationSeconds: r.duration_seconds,
    thumbnailUrl: r.thumbnail_url,
    category: r.content_type,
    publishedAt: r.published_at,
    playbackUrl: `${SITE_URL}/watch/${r.id}`,
    embedUrl: `${SITE_URL}/embed/${r.id}`,
  }));

  return NextResponse.json({
    data,
    total,
    limit,
    offset,
  });
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
  if (!auth.valid || !auth.orgId) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or expired API key." },
      { status: 401 },
    );
  }

  const scopes = auth.scopes ?? [];
  if (!scopes.includes("write:catalogue") && !scopes.includes("admin")) {
    return NextResponse.json(
      { error: "Forbidden. 'write:catalogue' scope is required for this endpoint." },
      { status: 403 },
    );
  }

  let body: {
    title?: string;
    synopsis?: string;
    durationSeconds?: number;
    category?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const title = body.title.trim();
  const slug = `${slugify(title)}-${Date.now().toString(36)}`;
  const synopsis = body.synopsis?.trim() ?? null;
  const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : 180;
  const contentType = body.category?.trim() ?? "film";

  const videoRow = await queryOne<{
    id: string;
    title: string;
    synopsis: string | null;
    duration_seconds: number;
    thumbnail_url: string | null;
    content_type: string;
    published_at: string | null;
  }>(
    `insert into videos (
      channel_id, title, slug, synopsis, duration_seconds, content_type,
      kind, status, processing_status, poster_gradient
    ) values ($1, $2, $3, $4, $5, $6, 'video', 'draft', 'none', ARRAY['#1e1b4b', '#0f172a'])
    returning id, title, synopsis, duration_seconds, thumbnail_url, content_type, published_at`,
    [auth.orgId, title, slug, synopsis, durationSeconds, contentType],
  );

  if (!videoRow) {
    return NextResponse.json({ error: "Failed to create partner video" }, { status: 500 });
  }

  return NextResponse.json(
    {
      video: {
        id: videoRow.id,
        title: videoRow.title,
        synopsis: videoRow.synopsis,
        durationSeconds: videoRow.duration_seconds,
        thumbnailUrl: videoRow.thumbnail_url,
        category: videoRow.content_type,
        publishedAt: videoRow.published_at,
        playbackUrl: `${SITE_URL}/watch/${videoRow.id}`,
        embedUrl: `${SITE_URL}/embed/${videoRow.id}`,
      },
    },
    { status: 201 },
  );
}
