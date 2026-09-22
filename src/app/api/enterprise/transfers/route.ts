// Enterprise API: Large File Transfers (GET, POST)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  createEnterpriseTransfer,
  listEnterpriseTransfers,
  resolveOrgIdForAccount,
} from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const transfers = await listEnterpriseTransfers(orgId);
  return NextResponse.json({ transfers });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

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
    orgId,
    title: body.title,
    fileName: body.fileName,
    fileSizeBytes: body.fileSizeBytes,
    downloadUrl: body.downloadUrl,
    expiresDays: body.expiresDays,
  });

  return NextResponse.json({ transfer: created }, { status: 201 });
}
