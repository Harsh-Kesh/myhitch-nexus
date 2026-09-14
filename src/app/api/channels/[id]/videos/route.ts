// GET /api/channels/[id]/videos — real implementation of docs/openapi.yaml's
// `getChannelVideos`. Public.
import { NextResponse, type NextRequest } from "next/server";
import { getChannelVideos } from "@/lib/server/catalogue";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  try {
    const videos = await getChannelVideos(
      id,
      limitParam ? Number(limitParam) : undefined,
      offsetParam ? Number(offsetParam) : undefined,
    );
    return NextResponse.json({ items: videos });
  } catch (err) {
    console.error(`GET /api/channels/${id}/videos failed`, err);
    return NextResponse.json({ error: "Failed to load channel videos." }, { status: 500 });
  }
}
