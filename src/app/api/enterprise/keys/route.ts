// Enterprise API: Keys Management (GET, POST, DELETE)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { checkRateLimit } from "@/lib/server/rateLimit";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  resolveOrgIdForAccount,
  hasActiveEnterpriseSubscription,
  sanitizeApiKeyScopes,
  NoOrganizationError,
} from "@/lib/server/enterprise";

// Developer/Partner API access is a Nexus Enterprise feature, not Business — previously
// ungated here, so any org member of any tier (a Business account included) could
// generate real API keys, since resolveOrgIdForAccount() below only checks membership.
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
  if (!(await hasActiveEnterpriseSubscription(account.id))) {
    return { error: NextResponse.json({ error: "Your Enterprise application is still pending approval." }, { status: 403 }) };
  }
  return { orgId };
}

export async function GET(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const keys = await listApiKeys(resolved.orgId);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

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

  // Never trust client-supplied scopes directly — sanitizeApiKeyScopes() drops anything
  // outside the real allow-list (in particular, a client could otherwise request
  // ["admin"], which the Partner API routes used to treat as a superuser bypass).
  const scopes = sanitizeApiKeyScopes(body.scopes);

  const rateLimit = await checkRateLimit(`api-key-create:${resolved.orgId}`, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many API keys created. Try again later." }, { status: 429 });
  }

  const created = await generateApiKey(
    resolved.orgId,
    body.name.trim(),
    scopes,
    body.expiresDays,
  );

  return NextResponse.json({ key: created }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get("id");

  if (!keyId) {
    return NextResponse.json({ error: "API key id is required" }, { status: 400 });
  }

  const revoked = await revokeApiKey(keyId, resolved.orgId);
  return NextResponse.json({ success: revoked });
}
