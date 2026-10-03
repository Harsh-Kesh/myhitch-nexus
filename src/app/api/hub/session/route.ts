// POST /api/hub/session/ — signs a MYHitch Business Portal business in to Nexus for the
// MYHitch mobile app. The app's backend (the MYHitch hub) calls this with its shared
// X-Api-Key (HUB_API_KEY) only after the Business Portal has confirmed the business is
// verified, approved by MYHitch and picked Nexus as one of its platforms — the same
// trusted-service pattern as the partner API keys. Nexus then finds the account by its
// Auth0 id (accounts.auth0_user_id, the shared MYHitch identity), or links an existing
// account with the same email, or creates one with a business channel, and returns a
// normal Nexus session — so every Studio / business route works unchanged.
//
// The account has no Nexus password (password_hash null): it's only ever opened through
// the Business Portal login.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { provisionChannelForRole } from "@/lib/server/channelProvisioning";
import { query, queryOne } from "@/lib/server/db";
import { createSession } from "@/lib/server/session";

interface HubSessionBody {
  auth0UserId?: string;
  email?: string;
  name?: string;
  businessName?: string;
  abn?: string;
  acn?: string;
  country?: string;
}

function hubKeyMatches(provided: string | null): boolean {
  const expected = process.env.HUB_API_KEY;
  if (!expected || !provided) return false;
  // Hash both so the comparison is constant-time whatever their lengths.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!process.env.HUB_API_KEY) {
    return NextResponse.json({ error: "MYHitch hub integration is not configured yet." }, { status: 501 });
  }
  if (!hubKeyMatches(request.headers.get("x-api-key"))) {
    return NextResponse.json({ error: "Invalid or missing X-Api-Key." }, { status: 401 });
  }

  let body: HubSessionBody;
  try {
    body = (await request.json()) as HubSessionBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const auth0UserId = body.auth0UserId?.trim();
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim() || email?.split("@")[0] || "";
  if (!auth0UserId || auth0UserId.length > 200 || !email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "auth0UserId and a valid email are required." }, { status: 422 });
  }
  const country = body.country?.trim() || "AU";

  // 1) Already linked to this MYHitch identity, 2) an existing Nexus account with the
  // same (portal-verified) email — linked, so its channel and videos stay attached.
  let account = await queryOne<{ id: string; status: string }>(
    `select id, status from accounts where auth0_user_id = $1`,
    [auth0UserId],
  );
  if (!account) {
    account = await queryOne<{ id: string; status: string }>(
      `update accounts set auth0_user_id = $2
         where lower(email) = $1 and auth0_user_id is null
       returning id, status`,
      [email, auth0UserId],
    );
  }
  // 3) A new business on Nexus.
  if (!account) {
    account = await queryOne<{ id: string; status: string }>(
      `insert into accounts (email, full_name, country, auth0_user_id)
       values ($1, $2, $3, $4)
       returning id, status`,
      [email, name, country, auth0UserId],
    );
  }
  if (!account) {
    return NextResponse.json({ error: "Could not open your Nexus account." }, { status: 500 });
  }
  if (account.status === "suspended" || account.status === "closed") {
    return NextResponse.json({ error: "This Nexus account can't be used right now." }, { status: 403 });
  }

  // A MYHitch-approved business: the business role, verified by the portal's review.
  await query(
    `insert into account_roles (account_id, role, verified)
     values ($1, 'business', true)
     on conflict (account_id, role) do nothing`,
    [account.id],
  );
  const membership = await queryOne<{ organization_id: string }>(
    `select organization_id from memberships where account_id = $1 limit 1`,
    [account.id],
  );
  if (!membership) {
    await provisionChannelForRole(account.id, "business", {
      name,
      country,
      email,
      orgName: body.businessName?.trim() || undefined,
      abn: body.abn?.trim() || undefined,
      acn: body.acn?.trim() || undefined,
    });
  }

  const session = await createSession(account.id, {
    remember: true,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });
  const channel = await queryOne<{ organization_id: string }>(
    `select organization_id from memberships where account_id = $1 limit 1`,
    [account.id],
  );
  return NextResponse.json({
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    account: { id: account.id, email, name, channelId: channel?.organization_id ?? null },
  });
}
