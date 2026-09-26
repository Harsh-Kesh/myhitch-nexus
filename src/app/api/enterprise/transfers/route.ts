// Enterprise API: Large File Transfers (GET, POST)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import {
  createEnterpriseTransfer,
  listEnterpriseTransfers,
  resolveOrgIdForAccount,
  isEnterpriseOrgActive,
  NoOrganizationError,
} from "@/lib/server/enterprise";
import { createEnterpriseTransferDownloadUrl, enterpriseTransferAssetExists } from "@/lib/server/storage";

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

  const transfers = await listEnterpriseTransfers(resolved.orgId);
  // A real signed link, minted fresh on every read (never a permanent/public URL that
  // could go stale or leak indefinitely) — same reasoning as video versions' own
  // download-URL minting. Falls back to a legacy manually-entered download_url for any
  // transfer created before real uploads existed.
  const withUrls = await Promise.all(
    transfers.map(async (transfer) => ({
      ...transfer,
      resolvedDownloadUrl: transfer.asset_path
        ? await createEnterpriseTransferDownloadUrl(transfer.asset_path).catch(() => null)
        : transfer.download_url,
    })),
  );
  return NextResponse.json({ transfers: withUrls });
}

export async function POST(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  let body: {
    title?: string;
    fileName?: string;
    fileSizeBytes?: number;
    assetPath?: string;
    expiresDays?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || !body.fileName || !body.fileSizeBytes || !body.assetPath) {
    return NextResponse.json(
      { error: "title, fileName, fileSizeBytes, and assetPath are required" },
      { status: 400 },
    );
  }

  const exists = await enterpriseTransferAssetExists(body.assetPath);
  if (!exists) {
    return NextResponse.json({ error: "That upload hasn't completed yet." }, { status: 409 });
  }

  const created = await createEnterpriseTransfer({
    orgId: resolved.orgId,
    title: body.title,
    fileName: body.fileName,
    fileSizeBytes: body.fileSizeBytes,
    assetPath: body.assetPath,
    expiresDays: body.expiresDays,
  });

  return NextResponse.json({ transfer: created }, { status: 201 });
}
