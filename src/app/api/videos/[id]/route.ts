// GET /api/videos/[id] — real implementation of docs/openapi.yaml's `getVideo`. Public.
import { NextResponse } from "next/server";
import { getVideoById } from "@/lib/server/catalogue";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const video = await getVideoById(id);
    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }
    return NextResponse.json(video);
  } catch (err) {
    console.error(`GET /api/videos/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load video." }, { status: 500 });
  }
}
