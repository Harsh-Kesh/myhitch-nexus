// Enterprise API: Keys Management (GET, POST, DELETE)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  resolveOrgIdForAccount,
} from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const keys = await listApiKeys(orgId);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  let body: {
    name?: string;
    scopes?: string[];
    expiresDays?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Key name is required" }, { status: 400 });
  }

  const scopes = Array.isArray(body.scopes) && body.scopes.length > 0
    ? body.scopes
    : ["read:catalogue", "embed:player"];

  const created = await generateApiKey(
    orgId,
    body.name.trim(),
    scopes,
    body.expiresDays,
  );

  return NextResponse.json({ key: created }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("id");

  if (!keyId) {
    return NextResponse.json({ error: "API key id is required" }, { status: 400 });
  }

  const revoked = await revokeApiKey(keyId, orgId);
  return NextResponse.json({ success: revoked });
}
