// POST /api/subscriptions/[id]/resume — undoes a pending cancel_at_period_end. Real
// counterpart of the cancel route's mirror image (resumeRealSubscription()). Real
// accounts only, and only ever their own subscription.
import { NextResponse, type NextRequest } from "next/server";
import { resumeRealSubscription } from "@/lib/server/subscriptions";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  try {
    const result = await resumeRealSubscription(account.id, id);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }
    return NextResponse.json({ currentPeriodEnd: result.currentPeriodEnd });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
    }
    console.error(`POST /api/subscriptions/${id}/resume failed`, err);
    return NextResponse.json({ error: "Failed to resume the subscription." }, { status: 500 });
  }
}
