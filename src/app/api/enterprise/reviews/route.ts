// Enterprise API: Client Reviews Management (GET, POST)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import {
  createClientReview,
  listClientReviews,
  resolveOrgIdForAccount,
  isEnterpriseOrgActive,
  NoOrganizationError,
} from "@/lib/server/enterprise";

// Creating/listing review links from the org side is Nexus Enterprise-only — the public
// /api/review/[token] page a client opens to actually watch and comment is unaffected
// (the token itself is the authorization there, not the viewer's own account).
async function requireOrg(request: NextRequest): Promise<{ orgId: string } | { error: NextResponse }> {
  const account = await getRequestAccount(request);
  if (!account) {
    return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }
  if (!hasAnyRole(account, ["producer"])) {
    return { error: NextResponse.json({ error: "This feature is included with Nexus Enterprise." }, { status: 403 }) };
  }
  let orgId: string;
  try {
    orgId = await resolveOrgIdForAccount(account.id);
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return { error: NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 }) };
    }
    throw err;
  }
  if (!(await isEnterpriseOrgActive(orgId))) {
    return { error: NextResponse.json({ error: "Your Enterprise application is still pending approval." }, { status: 403 }) };
  }
  return { orgId };
}

export async function GET(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const reviews = await listClientReviews(resolved.orgId);
  return NextResponse.json({ reviews });
}

export async function POST(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

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
    orgId: resolved.orgId,
    videoId: body.videoId,
    title: body.title,
    clientName: body.clientName,
    clientEmail: body.clientEmail,
    version: body.version,
    expiresDays: body.expiresDays,
  });

  return NextResponse.json(created, { status: 201 });
}
