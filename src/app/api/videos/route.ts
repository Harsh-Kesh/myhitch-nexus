// GET /api/videos — real implementation of docs/openapi.yaml's `searchVideos` operation,
// now backed by Typesense for full faceted search (see src/lib/server/catalogue.ts).
// Public: no auth required, matching FR-6.1 (anonymous browsing).
import { NextResponse, type NextRequest } from "next/server";
import { searchVideos, type SearchVideosParams } from "@/lib/server/catalogue";

function parseArrayParam(searchParams: URLSearchParams, key: string): string[] | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  // Support both repeated params (?contentTypes=a&contentTypes=b) and one comma-joined
  // param (?contentTypes=a,b), since we don't yet know which convention the frontend
  // will standardise on.
  return values.flatMap((v) => v.split(",")).filter(Boolean);
}

function parseIntParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseSortParam(searchParams: URLSearchParams): SearchVideosParams["sort"] {
  const raw = searchParams.get("sort");
  if (raw === "newest" || raw === "duration" || raw === "popular" || raw === "rating") return raw;
  return undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const result = await searchVideos({
      searchQuery: searchParams.get("query") ?? undefined,
      contentTypes: parseArrayParam(searchParams, "contentTypes"),
      categoryIds: parseArrayParam(searchParams, "categoryIds"),
      languages: parseArrayParam(searchParams, "languages"),
      countries: parseArrayParam(searchParams, "countries"),
      accessModels: parseArrayParam(searchParams, "accessModels"),
      ageRatings: parseArrayParam(searchParams, "ageRatings"),
      minDurationSeconds: parseIntParam(searchParams, "minDurationSeconds"),
      maxDurationSeconds: parseIntParam(searchParams, "maxDurationSeconds"),
      releaseYearFrom: parseIntParam(searchParams, "releaseYearFrom"),
      releaseYearTo: parseIntParam(searchParams, "releaseYearTo"),
      hasSubtitles: searchParams.get("hasSubtitles") === "true",
      freeOnly: searchParams.get("freeOnly") === "true",
      channelId: searchParams.get("channelId") ?? undefined,
      sort: parseSortParam(searchParams),
      limit: parseIntParam(searchParams, "limit"),
      offset: parseIntParam(searchParams, "offset"),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/videos failed", err);
    return NextResponse.json({ error: "Failed to search videos." }, { status: 500 });
  }
}
