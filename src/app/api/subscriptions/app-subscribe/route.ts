// POST /api/subscriptions/app-subscribe — the MYHitch mobile app's counterpart of
// ../checkout: buys a paid plan (Premium/Family/Business) with Stripe's native
// PaymentSheet in the app instead of a hosted Checkout redirect. Real accounts only
// (the MYHitch hub forwards the app's studio session cookie). Body
// `{ plan, interval }`, both required.
//
// - Already on a paid plan: same in-place change as ../checkout (409 if it's the same
//   plan and interval, otherwise `{ changed, plan, currentPeriodEnd }`) — no payment UI,
//   it's charged to the card the subscription already has.
// - Otherwise: creates the subscription unpaid and returns what the PaymentSheet needs
//   (`clientSecret`, `publishableKey`, `customerId`, `ephemeralKey`, `subscriptionId`).
//   Nothing is recorded until it's paid — the webhook, or POST ../app-confirm, does that.
import { NextResponse, type NextRequest } from "next/server";
import { listRealSubscriptions, startAppSubscription, PLAN_CATALOG, type BillingInterval, type PlanId } from "@/lib/server/subscriptions";
import { createAppEphemeralKey, getStripePublishableKey } from "@/lib/server/appPayments";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

const APP_PLANS: readonly PlanId[] = ["premium", "family", "business"];
const INTERVALS: readonly BillingInterval[] = ["month", "year"];

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { plan?: unknown; interval?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const plan = body?.plan as PlanId;
  const interval = body?.interval as BillingInterval;
  if (!APP_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  if (!INTERVALS.includes(interval) || !PLAN_CATALOG[plan].prices[interval]) {
    return NextResponse.json({ error: "That plan doesn't offer that billing interval." }, { status: 400 });
  }

  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      { code: "billing_not_configured", error: "Paying in the app isn't switched on yet." },
      { status: 503 },
    );
  }

  try {
    const result = await startAppSubscription(account.id, account.email, plan, interval);
    if (result.outcome === "already_subscribed") {
      return NextResponse.json({ error: "You're already on that plan." }, { status: 409 });
    }
    if (result.outcome === "invalid_interval") {
      return NextResponse.json({ error: "That plan doesn't offer that billing interval." }, { status: 400 });
    }
    if (result.outcome === "changed") {
      return NextResponse.json({ changed: true, plan: result.plan, currentPeriodEnd: result.currentPeriodEnd });
    }
    if (result.outcome === "active") {
      // Nothing to pay (a credit balance covered it) — already recorded, so hand back
      // the same list GET /api/subscriptions returns instead of a sheet to present.
      return NextResponse.json({
        clientSecret: null,
        publishableKey,
        customerId: result.customerId,
        ephemeralKey: null,
        subscriptionId: result.subscriptionId,
        items: await listRealSubscriptions(account.id),
      });
    }
    const ephemeralKey = await createAppEphemeralKey(result.customerId);
    return NextResponse.json({
      clientSecret: result.clientSecret,
      publishableKey,
      customerId: result.customerId,
      ephemeralKey,
      subscriptionId: result.subscriptionId,
    });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error("POST /api/subscriptions/app-subscribe failed", err);
    return NextResponse.json({ error: "Failed to start the subscription." }, { status: 500 });
  }
}
