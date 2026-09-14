// GET /api/channels — real implementation of docs/openapi.yaml's `getChannels`. Public.
import { NextResponse } from "next/server";
import { listChannels } from "@/lib/server/catalogue";

export async function GET() {
  try {
    const channels = await listChannels();
    return NextResponse.json({ items: channels });
  } catch (err) {
    console.error("GET /api/channels failed", err);
    return NextResponse.json({ error: "Failed to load channels." }, { status: 500 });
  }
}
