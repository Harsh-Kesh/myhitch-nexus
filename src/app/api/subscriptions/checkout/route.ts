// POST /api/subscriptions/checkout — creates a real Stripe Checkout session for a paid
// plan (Premium/Family/Business). Real accounts only. `plan`/`interval` default to
// Premium/monthly so an existing caller that only ever sent `returnPath` keeps working.
import { NextResponse, type NextRequest } from "next/server";
import { createPlanCheckoutSession, PLAN_CATALOG, type BillingInterval, type PlanId } from "@/lib/server/subscriptions";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { returnPath?: string; plan?: string; interval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  // Only a same-site path is ever accepted — never an absolute/external URL, so this
  // can't be used to redirect a Checkout return somewhere off-site.
  const returnPath = body.returnPath?.startsWith("/") ? body.returnPath : "/";
  const plan = (body.plan ?? "premium") as PlanId;
  const interval = (body.interval ?? "month") as BillingInterval;

  if (!PLAN_CATALOG[plan]) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  try {
    const result = await createPlanCheckoutSession(account.id, account.email, plan, interval, returnPath);
    if (result.outcome === "already_subscribed") {
      return NextResponse.json({ error: "You already have an active subscription." }, { status: 409 });
    }
    if (result.outcome === "invalid_interval") {
      return NextResponse.json({ error: "That plan doesn't offer that billing interval." }, { status: 400 });
    }
    return NextResponse.json({ url: result.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error("POST /api/subscriptions/checkout failed", err);
    return NextResponse.json({ error: "Failed to start checkout." }, { status: 500 });
  }
}
