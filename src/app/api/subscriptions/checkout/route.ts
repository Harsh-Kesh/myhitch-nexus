// POST /api/subscriptions/checkout — creates a real Stripe Checkout session for Nexus
// Premium. Real accounts only.
import { NextResponse, type NextRequest } from "next/server";
import { createPremiumCheckoutSession } from "@/lib/server/subscriptions";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { returnPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  // Only a same-site path is ever accepted — never an absolute/external URL, so this
  // can't be used to redirect a Checkout return somewhere off-site.
  const returnPath = body.returnPath?.startsWith("/") ? body.returnPath : "/";

  try {
    const result = await createPremiumCheckoutSession(account.id, account.email, returnPath);
    if (result.outcome === "already_subscribed") {
      return NextResponse.json({ error: "You already have an active Nexus Premium subscription." }, { status: 409 });
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
