// POST /api/admin/purchases/[id]/refund/ — super-admin only. Refunds a rental/purchase
// (an `entitlements` row) that was paid from the MYHitch Wallet, body { reason }. Nexus
// had no refund flow before this (the billing page says to contact support); card
// payments are still refunded in the Stripe Dashboard, so a card-paid purchase answers
// 409 { code: "not_wallet_paid" }. A wallet payment is refunded by the MYHitch hub
// (POST ${HUB_URL}/v1/nexus/wallet-refunds) — never by Nexus's Stripe — and only marked
// refunded once the hub answers 2xx (hubWallet.ts's refundWalletEntitlement()).
import { NextResponse, type NextRequest } from "next/server";
import { refundWalletEntitlement, WalletNotReadyError, walletNotReadyResponse } from "@/lib/server/hubWallet";
import { recordAudit } from "@/lib/server/moderation";
import { describeAdminTier, getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: { reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // No body: no reason given.
  }
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "Refunded by MYHitch support";

  try {
    const result = await refundWalletEntitlement(id, reason);
    switch (result.outcome) {
      case "refunded":
        await recordAudit({
          actorAccountId: account.id,
          actorName: account.fullName,
          actorRole: describeAdminTier(account.roles),
          action: "purchase.refunded",
          targetType: "entitlement",
          targetId: result.entitlementId,
          reason: `Refunded ${(result.amountMinor / 100).toFixed(2)} to the customer's MYHitch Wallet (${result.walletReference}): ${reason}`,
          severity: "notice",
        });
        return NextResponse.json({ refunded: true, entitlementId: result.entitlementId, amountMinor: result.amountMinor });
      case "not_found":
        return NextResponse.json({ error: "No such purchase." }, { status: 404 });
      case "already_refunded":
        return NextResponse.json({ error: "This purchase was already refunded.", code: "already_refunded" }, { status: 409 });
      case "not_wallet_paid":
        return NextResponse.json(
          {
            error: "This purchase wasn't paid with the MYHitch Wallet. Refund card payments in the Stripe Dashboard.",
            code: "not_wallet_paid",
          },
          { status: 409 },
        );
      case "hub_not_configured":
        return NextResponse.json(
          { error: "HUB_URL / HUB_API_KEY aren't set, so wallet refunds can't be sent.", code: "hub_not_configured" },
          { status: 503 },
        );
      case "hub_failed":
        return NextResponse.json(
          { error: `The MYHitch hub didn't refund it: ${result.error}`, code: "hub_failed", hubStatus: result.status },
          { status: 502 },
        );
    }
  } catch (err) {
    if (err instanceof WalletNotReadyError) return walletNotReadyResponse(err);
    console.error(`POST /api/admin/purchases/${id}/refund failed`, err);
    return NextResponse.json({ error: "Couldn't refund this purchase." }, { status: 500 });
  }
}
