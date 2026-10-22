// POST /api/hub/app/wallet/quote/ — the MYHitch hub asks what renting/buying a movie
// costs when the signed-in app customer pays from their MYHitch Wallet. Body
// { movie_id, kind: "rent" | "buy" } (kind as for POST movies/[id]/checkout/). Priced and
// refused exactly like that card checkout, but no PaymentIntent is created and nothing is
// granted. Answers
//   { quote_id, total_cents, currency: "aud", payees: [{ connected_account_id, amount_cents }],
//     expires_at, title }
// — payees is the business's share (what it nets from the same sale by card) and its
// Business Portal connected account. 409 { code: "wallet_unavailable" } when the movie
// can't be paid from the wallet (its business has no Portal connected account, or it's
// free). See hubWallet.ts.
import { NextResponse, type NextRequest } from "next/server";
import { appSaleRefusal, parseAppKind, requireHubViewer } from "@/lib/server/appViewers";
import { createWalletQuote, WalletNotReadyError, walletNotReadyResponse } from "@/lib/server/hubWallet";

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireHubViewer(request);
  if (response) return response;

  let body: { movie_id?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = parseAppKind(body?.kind);
  if (parsed.response) return parsed.response;
  const { kind } = parsed;
  const movieId = typeof body.movie_id === "string" ? body.movie_id : "";
  if (!movieId) return NextResponse.json({ error: "movie_id is required." }, { status: 400 });

  try {
    const result = await createWalletQuote(viewer, movieId, kind);
    switch (result.outcome) {
      case "quote":
        return NextResponse.json(result.quote);
      case "wallet_unavailable":
        return NextResponse.json(
          { error: "This can't be paid with the MYHitch Wallet.", code: "wallet_unavailable" },
          { status: 409 },
        );
      case "portal_unavailable":
        return NextResponse.json(
          {
            error: "Paying with the MYHitch Wallet isn't available right now. Try again, or pay by card.",
            code: "portal_unavailable",
          },
          { status: 503 },
        );
      default:
        return appSaleRefusal(result, kind);
    }
  } catch (err) {
    if (err instanceof WalletNotReadyError) return walletNotReadyResponse(err);
    console.error("POST /api/hub/app/wallet/quote failed", err);
    return NextResponse.json({ error: "Couldn't price this movie. Try again." }, { status: 500 });
  }
}
