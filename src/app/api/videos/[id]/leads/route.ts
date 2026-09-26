// POST /api/videos/[id]/leads — public "Get a quote" form submission from a business
// video's player, no sign-in required (a prospective customer isn't necessarily a Nexus
// account holder).
import { NextResponse, type NextRequest } from "next/server";
import { createLeadFromVideo } from "@/lib/server/businessLeads";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { name?: string; email?: string; company?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.name || !body.email || !body.message) {
    return NextResponse.json({ error: "name, email and message are required." }, { status: 400 });
  }

  const result = await createLeadFromVideo({
    videoId: id,
    name: body.name,
    email: body.email,
    company: body.company,
    message: body.message,
  });
  switch (result.outcome) {
    case "video_not_found":
      return NextResponse.json({ error: "This video isn't available." }, { status: 404 });
    case "invalid":
      return NextResponse.json({ error: result.reason }, { status: 400 });
    case "success":
      return NextResponse.json({ ok: true }, { status: 201 });
  }
}
