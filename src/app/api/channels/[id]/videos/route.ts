// GET /api/channels/[id]/videos — real implementation of docs/openapi.yaml's
// `getChannelVideos`. Public for published-only reads. `includeUnpublished=true` is
// Studio's own content list asking for its drafts/pending/scheduled videos too — gated
// here to actual members of the channel, never served to an anonymous or unrelated
// caller (closes the gap noted in business/videos/page.tsx and business/channel/page.tsx:
// this always fell through to mock data before, since there was no authenticated owner
// check to gate a real "my unpublished videos" read on).
import { NextResponse, type NextRequest } from "next/server";
import { getChannelVideos } from "@/lib/server/catalogue";
import { getRequestAccount } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const includeUnpublished = searchParams.get("includeUnpublished") === "true";

  try {
    if (includeUnpublished) {
      const account = await getRequestAccount(request);
      if (!account) {
        return NextResponse.json({ error: "Sign in required." }, { status: 401 });
      }
      const membership = await query(
        `select 1 from memberships where account_id = $1 and organization_id = $2`,
        [account.id, id],
      );
      if (membership.length === 0) {
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      }
    }

    const videos = await getChannelVideos(id, {
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
      includeUnpublished,
    });
    return NextResponse.json({ items: videos });
  } catch (err) {
    console.error(`GET /api/channels/${id}/videos failed`, err);
    return NextResponse.json({ error: "Failed to load channel videos." }, { status: 500 });
  }
}
