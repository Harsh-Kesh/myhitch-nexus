// Enterprise API: Large File Transfers (GET, POST)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import {
  createEnterpriseTransfer,
  listEnterpriseTransfers,
  resolveOrgIdForAccount,
  NoOrganizationError,
} from "@/lib/server/enterprise";

async function requireOrg(request: NextRequest): Promise<{ orgId: string } | { error: NextResponse }> {
  const account = await getRequestAccount(request);
  if (!account) {
    return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }
  if (!hasAnyRole(account, ["producer"])) {
    return { error: NextResponse.json({ error: "This feature is included with Nexus Enterprise." }, { status: 403 }) };
  }
  try {
    return { orgId: await resolveOrgIdForAccount(account.id) };
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return { error: NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 }) };
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const transfers = await listEnterpriseTransfers(resolved.orgId);
  return NextResponse.json({ transfers });
}

export async function POST(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  let body: {
    title?: string;
    fileName?: string;
    fileSizeBytes?: number;
    downloadUrl?: string;
    expiresDays?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || !body.fileName || !body.fileSizeBytes) {
    return NextResponse.json(
      { error: "title, fileName, and fileSizeBytes are required" },
      { status: 400 },
    );
  }

  const created = await createEnterpriseTransfer({
    orgId: resolved.orgId,
    title: body.title,
    fileName: body.fileName,
    fileSizeBytes: body.fileSizeBytes,
    downloadUrl: body.downloadUrl,
    expiresDays: body.expiresDays,
  });

  return NextResponse.json({ transfer: created }, { status: 201 });
}
