import { test, expect, request, type APIRequestContext } from "@playwright/test";

/**
 * The role x endpoint authorization matrix — SRS AC-6/AC-8's "role-permission matrix
 * test" and DEVELOPMENT-PLAN.md §7's Authorisation testing layer. Pure API testing (no
 * browser) against real route handlers and a real database, same server `test:e2e`
 * already runs against (see playwright.config.ts). Every case here asserts
 * deny-by-default: an anonymous or wrong-role/wrong-owner request must never reach the
 * privileged behaviour, regardless of what a route would otherwise do with it.
 *
 * Fixture accounts come from `npm run seed:authz-accounts` (scripts/seed-authz-test-
 * accounts.mjs) — five single-role accounts (not the demo account, which holds every
 * role and so can never prove a deny case), including two separate creators so
 * ownership checks (not just role checks) are exercised: creator2 must never be able to
 * touch creator1's channel.
 *
 * Found live during this suite's own setup, before any test ran: POST
 * /api/auth/register accepted an unvalidated `role` from the request body, and
 * `account_roles`'s check constraint happens to permit "admin" — a real, unauthenticated
 * privilege-escalation hole, fixed the same day (see DEVELOPMENT-PLAN.md's 2026-09-18
 * entry). AUTHZ-0 below is the regression test for that exact fix.
 */

const PASSWORD = "AuthzTest123!";

const ACCOUNTS = {
  viewer: { email: "authz.viewer@nexus.test" },
  creator1: { email: "authz.creator1@nexus.test" },
  creator2: { email: "authz.creator2@nexus.test" },
  business: { email: "authz.business@nexus.test" },
  admin: { email: "authz.admin@nexus.test" },
} as const;

type Role = keyof typeof ACCOUNTS;

async function authedContext(baseURL: string, role: Role): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/login/", {
    data: { email: ACCOUNTS[role].email, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`Fixture login failed for ${role} (${res.status()}) — run 'npm run seed:authz-accounts' first.`);
  }
  return ctx;
}

let anon: APIRequestContext;
let asViewer: APIRequestContext;
let asCreator1: APIRequestContext;
let asCreator2: APIRequestContext;
let asBusiness: APIRequestContext;
let asAdmin: APIRequestContext;
let creator1ChannelId: string;

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  anon = await request.newContext({ baseURL });
  [asViewer, asCreator1, asCreator2, asBusiness, asAdmin] = await Promise.all([
    authedContext(baseURL, "viewer"),
    authedContext(baseURL, "creator1"),
    authedContext(baseURL, "creator2"),
    authedContext(baseURL, "business"),
    authedContext(baseURL, "admin"),
  ]);

  const me = await asCreator1.get("/api/auth/me/");
  const body = (await me.json()) as { account: { channelId: string | null } };
  if (!body.account.channelId) {
    throw new Error("authz.creator1 fixture has no channel — re-run the seed script.");
  }
  creator1ChannelId = body.account.channelId;
});

test.afterAll(async () => {
  await Promise.all([
    anon?.dispose(),
    asViewer?.dispose(),
    asCreator1?.dispose(),
    asCreator2?.dispose(),
    asBusiness?.dispose(),
    asAdmin?.dispose(),
  ]);
});

test.describe("Authorization matrix — regression test", () => {
  test("AUTHZ-0: registering with role=admin is rejected, not granted", async () => {
    const res = await anon.post("/api/auth/register/", {
      data: {
        email: `authz-privesc-${Date.now()}@nexus.test`,
        password: "TestPass123!",
        name: "Authz Privesc Probe",
        role: "admin",
      },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Authorization matrix — admin routes", () => {
  const ADMIN_GET_ROUTES = [
    "/api/admin/audit-log/",
    "/api/admin/commissions/",
    "/api/admin/moderation/",
    "/api/admin/organisations/",
    "/api/admin/users/",
  ];

  for (const path of ADMIN_GET_ROUTES) {
    test(`GET ${path} — anonymous is denied`, async () => {
      const res = await anon.get(path);
      expect(res.status()).toBe(401);
    });

    test(`GET ${path} — viewer is denied`, async () => {
      const res = await asViewer.get(path);
      expect(res.status()).toBe(403);
    });

    test(`GET ${path} — creator is denied`, async () => {
      const res = await asCreator1.get(path);
      expect(res.status()).toBe(403);
    });

    test(`GET ${path} — business is denied`, async () => {
      const res = await asBusiness.get(path);
      expect(res.status()).toBe(403);
    });

    test(`GET ${path} — admin is allowed`, async () => {
      const res = await asAdmin.get(path);
      expect(res.ok()).toBeTruthy();
    });
  }

  // POST-only (no GET handler exists) — an empty body still proves whether the request
  // reached the auth gate: a non-admin is stopped at 403 before body validation ever
  // runs, while admin passes through to a 400 for the missing fields, not 401/403. This
  // deliberately never completes a real creation, so there's no category row to clean up.
  const path = "/api/admin/categories/";

  test(`POST ${path} — anonymous is denied`, async () => {
    const res = await anon.post(path, { data: {} });
    expect(res.status()).toBe(401);
  });

  test(`POST ${path} — viewer is denied`, async () => {
    const res = await asViewer.post(path, { data: {} });
    expect(res.status()).toBe(403);
  });

  test(`POST ${path} — creator is denied`, async () => {
    const res = await asCreator1.post(path, { data: {} });
    expect(res.status()).toBe(403);
  });

  test(`POST ${path} — admin reaches past the auth gate`, async () => {
    const res = await asAdmin.post(path, { data: {} });
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });
});

test.describe("Authorization matrix — ownership-scoped routes", () => {
  test("PATCH /api/channels/[id] — anonymous is denied", async () => {
    const res = await anon.patch(`/api/channels/${creator1ChannelId}/`, { data: { tagline: "x" } });
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/channels/[id] — a different creator is denied (not the owner)", async () => {
    const res = await asCreator2.patch(`/api/channels/${creator1ChannelId}/`, { data: { tagline: "x" } });
    expect(res.status()).toBe(403);
  });

  test("PATCH /api/channels/[id] — the owning creator is allowed", async () => {
    const res = await asCreator1.patch(`/api/channels/${creator1ChannelId}/`, {
      data: { tagline: "Authorization matrix test tagline" },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("PUT membership-tier — a different creator is denied", async () => {
    const res = await asCreator2.put(`/api/channels/${creator1ChannelId}/membership-tier/`, {
      data: { priceMinor: 500, currency: "GBP", isEnabled: false, benefits: [] },
    });
    expect(res.status()).toBe(403);
  });

  test("PUT membership-tier — the owning creator is allowed", async () => {
    const res = await asCreator1.put(`/api/channels/${creator1ChannelId}/membership-tier/`, {
      data: { priceMinor: 500, currency: "GBP", isEnabled: false, benefits: [] },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("GET revenue — anonymous is denied", async () => {
    const res = await anon.get(`/api/studio/revenue/?channelId=${creator1ChannelId}`);
    expect(res.status()).toBe(401);
  });

  test("GET revenue — a different creator is denied", async () => {
    const res = await asCreator2.get(`/api/studio/revenue/?channelId=${creator1ChannelId}`);
    expect(res.status()).toBe(403);
  });

  test("GET revenue — the owning creator is allowed", async () => {
    const res = await asCreator1.get(`/api/studio/revenue/?channelId=${creator1ChannelId}`);
    expect(res.ok()).toBeTruthy();
  });

  test("GET payouts status — a different creator is denied", async () => {
    const res = await asCreator2.get(`/api/studio/payouts/status/?channelId=${creator1ChannelId}`);
    expect(res.status()).toBe(403);
  });

  test("GET payouts status — the owning creator is allowed", async () => {
    const res = await asCreator1.get(`/api/studio/payouts/status/?channelId=${creator1ChannelId}`);
    expect(res.ok()).toBeTruthy();
  });
});

test.describe("Authorization matrix — signed-in-only routes", () => {
  const SIGNED_IN_ROUTES = ["/api/subscriptions/", "/api/purchases/"];

  for (const path of SIGNED_IN_ROUTES) {
    test(`GET ${path} — anonymous is denied`, async () => {
      const res = await anon.get(path);
      expect(res.status()).toBe(401);
    });

    test(`GET ${path} — any signed-in role is allowed`, async () => {
      const res = await asViewer.get(path);
      expect(res.ok()).toBeTruthy();
    });
  }
});
