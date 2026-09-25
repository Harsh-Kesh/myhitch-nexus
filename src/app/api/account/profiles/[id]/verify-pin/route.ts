// POST /api/account/profiles/[id]/verify-pin — the real, server-side parental-PIN check.
// Never returns the PIN or its hash; only whether the supplied PIN was correct.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { verifyProfilePin } from "@/lib/server/profilePin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id: profileId } = await params;

  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.pin) {
    return NextResponse.json({ error: "pin is required" }, { status: 400 });
  }

  const result = await verifyProfilePin(account.id, profileId, body.pin);
  switch (result.outcome) {
    case "not_found":
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    case "no_pin_set":
      return NextResponse.json({ error: "This profile has no PIN set." }, { status: 400 });
    case "rate_limited":
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    case "incorrect":
      return NextResponse.json({ correct: false });
    case "correct":
      return NextResponse.json({ correct: true });
  }
}
