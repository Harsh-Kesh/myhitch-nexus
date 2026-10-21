// POST /api/hub/app/wallet/confirm/ — the MYHitch hub has taken the quote's total from
// the customer's wallet and Transferred the business its share; Nexus now grants the
// rental/purchase exactly as a paid card checkout does. Body
// { quote_id, wallet_reference, transfer_ids: [...], amount_cents }. Idempotent on
// quote_id (a repeat answers the same). The quote must be this X-MYHitch-User's, not
// released or expired, and amount_cents must be its total. Answers
//   { purchase: { id, movieId, kind, status, purchasedAt, expiresAt },   (as GET purchases)
//     paymentMethod: "myhitch_wallet", walletReference, amountCents, currency: "aud" }
// Any 4xx tells the hub to undo the payment and release the quote. See hubWallet.ts.
import { NextResponse, type NextRequest } from "next/server";
import { appSaleRefusal, requireHubViewer } from "@/lib/server/appViewers";
import {
  confirmWalletPayment,
  parseWalletConfirm,
  WalletNotReadyError,
  walletNotReadyResponse,
} from "@/lib/server/hubWallet";

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireHubViewer(request);
  if (response) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = parseWalletConfirm(body);
  if (parsed.error !== undefined) {
    return NextResponse.json({ error: parsed.error, code: "bad_request" }, { status: 400 });
  }

  try {
    const result = await confirmWalletPayment(viewer, parsed.input);
    switch (result.outcome) {
      case "confirmed":
        return NextResponse.json({
          purchase: result.purchase,
          paymentMethod: "myhitch_wallet",
          walletReference: result.walletReference,
          amountCents: result.amountCents,
          currency: "aud",
        });
      case "quote_not_found":
        return NextResponse.json(
          { error: "This checkout has ended. Start again.", code: "quote_not_found" },
          { status: 404 },
        );
      case "quote_released":
        return NextResponse.json(
          { error: "This checkout was cancelled. Start again.", code: "quote_released" },
          { status: 409 },
        );
      case "quote_expired":
        return NextResponse.json(
          { error: "This checkout has expired. Start again.", code: "quote_expired" },
          { status: 410 },
        );
      case "amount_mismatch":
        return NextResponse.json(
          {
            error: "The amount paid doesn't match the price.",
            code: "amount_mismatch",
            expected_cents: result.expectedCents,
          },
          { status: 422 },
        );
      case "transfers_missing":
        return NextResponse.json(
          { error: "The business hasn't been paid its share.", code: "transfers_missing" },
          { status: 422 },
        );
      case "already_confirmed":
        return NextResponse.json(
          { error: "This checkout was already paid with another wallet payment.", code: "already_confirmed" },
          { status: 409 },
        );
      case "already_entitled":
        // The same answer the card checkout gives.
        return appSaleRefusal(result, "buy");
    }
  } catch (err) {
    if (err instanceof WalletNotReadyError) return walletNotReadyResponse(err);
    console.error("POST /api/hub/app/wallet/confirm failed", err);
    return NextResponse.json({ error: "Couldn't complete the order. Try again." }, { status: 500 });
  }
}
