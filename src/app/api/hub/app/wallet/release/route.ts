// POST /api/hub/app/wallet/release/ — the MYHitch hub backed out of a wallet payment (or
// undid one that failed): body { quote_id }. The quote can never be confirmed after this.
// Idempotent: { released: true } again for an already-released quote. 409
// { code: "already_confirmed" } for a quote that was paid (refund it instead). See
// hubWallet.ts.
import { NextResponse, type NextRequest } from "next/server";
import { requireHubViewer } from "@/lib/server/appViewers";
import { releaseWalletQuote, WalletNotReadyError, walletNotReadyResponse } from "@/lib/server/hubWallet";

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireHubViewer(request);
  if (response) return response;

  let body: { quote_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body?.quote_id !== "string" || !body.quote_id) {
    return NextResponse.json({ error: "quote_id is required.", code: "bad_request" }, { status: 400 });
  }

  try {
    const result = await releaseWalletQuote(viewer, body.quote_id);
    switch (result.outcome) {
      case "released":
        return NextResponse.json({ released: true });
      case "quote_not_found":
        return NextResponse.json({ error: "No such checkout.", code: "quote_not_found" }, { status: 404 });
      case "already_confirmed":
        return NextResponse.json({ error: "This checkout was already paid.", code: "already_confirmed" }, { status: 409 });
    }
  } catch (err) {
    if (err instanceof WalletNotReadyError) return walletNotReadyResponse(err);
    console.error("POST /api/hub/app/wallet/release failed", err);
    return NextResponse.json({ error: "Couldn't cancel the checkout. Try again." }, { status: 500 });
  }
}
