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
 * accounts.mjs) — seven single-role accounts (not the demo account, which holds every
 * role and so can never prove a deny case), including two separate creators so
 * ownership checks (not just role checks) are exercised: creator2 must never be able to
 * touch creator1's channel, and three scoped admin tiers (moderator/finance-admin/
 * super-admin, ROLE-8/9/10) so the admin-routes matrix proves real *denials* between
 * tiers, not just "some admin can, nobody else can."
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
  moderator: { email: "authz.moderator@nexus.test" },
  financeAdmin: { email: "authz.finance@nexus.test" },
  superAdmin: { email: "authz.admin@nexus.test" },
} as const;

type Role = keyof typeof ACCOUNTS;
const ADMIN_TIERS = ["moderator", "financeAdmin", "superAdmin"] as const;

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
let asModerator: APIRequestContext;
let asFinanceAdmin: APIRequestContext;
let asSuperAdmin: APIRequestContext;
let creator1ChannelId: string;

const tierContext: Record<(typeof ADMIN_TIERS)[number], () => APIRequestContext> = {
  moderator: () => asModerator,
  financeAdmin: () => asFinanceAdmin,
  superAdmin: () => asSuperAdmin,
};

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  anon = await request.newContext({ baseURL });
  [asViewer, asCreator1, asCreator2, asBusiness, asModerator, asFinanceAdmin, asSuperAdmin] = await Promise.all([
    authedContext(baseURL, "viewer"),
    authedContext(baseURL, "creator1"),
    authedContext(baseURL, "creator2"),
    authedContext(baseURL, "business"),
    authedContext(baseURL, "moderator"),
    authedContext(baseURL, "financeAdmin"),
    authedContext(baseURL, "superAdmin"),
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
    asModerator?.dispose(),
    asFinanceAdmin?.dispose(),
    asSuperAdmin?.dispose(),
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

test.describe("Authorization matrix — admin routes, no tier scoping", () => {
  // Routes every scoped tier is allowed on (docs/openapi.yaml: "moderator, finance-admin
  // or super-admin") — the deny cases below (anon/viewer/creator/business) are the part
  // that matters here; per-tier scoping is covered by the matrix in the next block.
  const ADMIN_GET_ROUTES = ["/api/admin/summary/", "/api/admin/copyright-cases/"];

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

    for (const tier of ADMIN_TIERS) {
      test(`GET ${path} — ${tier} is allowed`, async () => {
        const res = await tierContext[tier]().get(path);
        expect(res.ok()).toBeTruthy();
      });
    }
  }
});

test.describe("Authorization matrix — scoped admin tiers (ROLE-8/9/10)", () => {
  // The real proof scoped roles work: each route allows exactly the tiers
  // docs/openapi.yaml documents for it and denies (403) every other tier — not just
  // "some admin can, nobody else can," the flat check this replaced could never fail this
  // way even when broken.
  const MATRIX: Array<{ method: "GET" | "POST"; path: string; allow: (typeof ADMIN_TIERS)[number][] }> = [
    { method: "GET", path: "/api/admin/moderation/", allow: ["moderator", "superAdmin"] },
    { method: "GET", path: "/api/admin/organisations/", allow: ["moderator", "superAdmin"] },
    { method: "GET", path: "/api/admin/users/", allow: ["superAdmin"] },
    { method: "GET", path: "/api/admin/commissions/", allow: ["superAdmin"] },
  ];

  for (const { method, path, allow } of MATRIX) {
    for (const tier of ADMIN_TIERS) {
      const shouldAllow = allow.includes(tier);
      test(`${method} ${path} — ${tier} is ${shouldAllow ? "allowed" : "denied"}`, async () => {
        const ctx = tierContext[tier]();
        const res = method === "GET" ? await ctx.get(path) : await ctx.post(path, { data: {} });
        if (shouldAllow) {
          expect(res.ok()).toBeTruthy();
        } else {
          expect(res.status()).toBe(403);
        }
      });
    }
  }

  // POST-only (no GET handler exists) — an empty body still proves whether the request
  // reached the auth gate: a denied tier is stopped at 403 before body validation ever
  // runs, while an allowed one passes through to a 400 for the missing fields, not
  // 401/403. This deliberately never completes a real creation, so there's no category
  // row to clean up. Super-admin only, per docs/openapi.yaml.
  const categoriesPath = "/api/admin/categories/";

  test(`POST ${categoriesPath} — anonymous is denied`, async () => {
    const res = await anon.post(categoriesPath, { data: {} });
    expect(res.status()).toBe(401);
  });

  test(`POST ${categoriesPath} — viewer is denied`, async () => {
    const res = await asViewer.post(categoriesPath, { data: {} });
    expect(res.status()).toBe(403);
  });

  test(`POST ${categoriesPath} — creator is denied`, async () => {
    const res = await asCreator1.post(categoriesPath, { data: {} });
    expect(res.status()).toBe(403);
  });

  test(`POST ${categoriesPath} — moderator is denied`, async () => {
    const res = await asModerator.post(categoriesPath, { data: {} });
    expect(res.status()).toBe(403);
  });

  test(`POST ${categoriesPath} — finance-admin is denied`, async () => {
    const res = await asFinanceAdmin.post(categoriesPath, { data: {} });
    expect(res.status()).toBe(403);
  });

  test(`POST ${categoriesPath} — super-admin reaches past the auth gate`, async () => {
    const res = await asSuperAdmin.post(categoriesPath, { data: {} });
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
