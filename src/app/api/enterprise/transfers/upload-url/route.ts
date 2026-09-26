// POST /api/enterprise/transfers/upload-url — a real signed upload URL for a large file
// transfer's asset, same signed-URL-direct-to-storage pattern the video-versions route
// already uses. The client PUTs the file directly to Supabase Storage, then calls
// POST /api/enterprise/transfers with the returned `path` to actually register the
// transfer row.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { resolveOrgIdForAccount, hasActiveEnterpriseSubscription, NoOrganizationError } from "@/lib/server/enterprise";
import { createEnterpriseTransferUploadUrl } from "@/lib/server/storage";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["producer"])) {
    return NextResponse.json({ error: "This feature is included with Nexus Enterprise." }, { status: 403 });
  }

  let orgId: string;
  try {
    orgId = await resolveOrgIdForAccount(account.id);
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 });
    }
    throw err;
  }
  if (!(await hasActiveEnterpriseSubscription(account.id))) {
    return NextResponse.json({ error: "Your Enterprise application is still pending approval." }, { status: 403 });
  }

  let body: { fileName?: string; fileSizeBytes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.fileName || typeof body.fileSizeBytes !== "number") {
    return NextResponse.json({ error: "fileName and fileSizeBytes are required." }, { status: 400 });
  }

  try {
    const { path, signedUrl, token } = await createEnterpriseTransferUploadUrl(orgId, body.fileName, body.fileSizeBytes);
    return NextResponse.json({ path, signedUrl, token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create an upload URL." },
      { status: 400 },
    );
  }
}
