// GET /api/videos/[id]/product-links — public, real product links attached to a video,
// for the "Shop this video" card during playback.
import { NextResponse, type NextRequest } from "next/server";
import { getVideoProductLinks } from "@/lib/server/productLinks";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const links = await getVideoProductLinks(id);
  return NextResponse.json({ links });
}
