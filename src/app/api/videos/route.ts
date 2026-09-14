// GET /api/videos — real implementation of a slice of docs/openapi.yaml's
// `searchVideos` operation (see src/lib/server/catalogue.ts for what's implemented vs
// deferred to Typesense). Public: no auth required, matching FR-6.1 (anonymous browsing).
import { NextResponse, type NextRequest } from "next/server";
import { searchVideos } from "@/lib/server/catalogue";

function parseArrayParam(searchParams: URLSearchParams, key: string): string[] | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  // Support both repeated params (?contentTypes=a&contentTypes=b) and one comma-joined
  // param (?contentTypes=a,b), since we don't yet know which convention the frontend
  // will standardise on.
  return values.flatMap((v) => v.split(",")).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  try {
    const result = await searchVideos({
      searchQuery: searchParams.get("query") ?? undefined,
      contentTypes: parseArrayParam(searchParams, "contentTypes"),
      categoryIds: parseArrayParam(searchParams, "categoryIds"),
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/videos failed", err);
    return NextResponse.json({ error: "Failed to search videos." }, { status: 500 });
  }
}
