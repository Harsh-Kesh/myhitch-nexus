// GET/POST /api/enterprise/sso — real SSO/SAML config storage for the signed-in
// account's own organization. See saveSsoConfig()'s header for what's real here (the
// config) vs not (an actual SAML login flow — no identity-provider integration exists).
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { resolveOrgIdForAccount, isEnterpriseOrgActive, NoOrganizationError, getSsoConfig, saveSsoConfig } from "@/lib/server/enterprise";

async function requireOrg(request: NextRequest): Promise<{ orgId: string } | { error: NextResponse }> {
  const account = await getRequestAccount(request);
  if (!account) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
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
  const config = await getSsoConfig(resolved.orgId);
  return NextResponse.json({ config });
}

export async function POST(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  let body: { idpMetadataUrl?: string; ssoDomain?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const config = await saveSsoConfig(resolved.orgId, body);
  return NextResponse.json({ config });
}
