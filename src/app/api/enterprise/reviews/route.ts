// Enterprise API: Client Reviews Management (GET, POST)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  createClientReview,
  listClientReviews,
  resolveOrgIdForAccount,
} from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const reviews = await listClientReviews(orgId);
  return NextResponse.json({ reviews });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  let body: {
    videoId?: string;
    title?: string;
    clientName?: string;
    clientEmail?: string;
    version?: number;
    expiresDays?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.videoId || !body.title || !body.clientName) {
    return NextResponse.json(
      { error: "videoId, title, and clientName are required" },
      { status: 400 },
    );
  }

  const created = await createClientReview({
    orgId,
    videoId: body.videoId,
    title: body.title,
    clientName: body.clientName,
    clientEmail: body.clientEmail,
    version: body.version,
    expiresDays: body.expiresDays,
  });

  return NextResponse.json(created, { status: 201 });
}
