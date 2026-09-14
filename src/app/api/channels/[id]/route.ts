// GET /api/channels/[id] — real implementation of docs/openapi.yaml's `getChannel`. Public.
import { NextResponse } from "next/server";
import { getChannelById } from "@/lib/server/catalogue";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const channel = await getChannelById(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }
    return NextResponse.json(channel);
  } catch (err) {
    console.error(`GET /api/channels/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load channel." }, { status: 500 });
  }
}
