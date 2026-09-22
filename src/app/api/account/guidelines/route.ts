// GET/POST /api/account/guidelines — community guidelines acknowledgement and status (FR-6.6.4).
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { getLegalAcceptances, hasAcceptedGuidelines, recordLegalAcceptance } from "@/lib/server/legalAcceptance";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const accepted = await hasAcceptedGuidelines(account.id);
  const acceptances = await getLegalAcceptances(account.id);

  return NextResponse.json({
    accepted,
    acceptances: acceptances.filter((a) => a.documentType === "community_guidelines"),
  });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { version?: string };
  try {
    body = (await request.json()) as { version?: string };
  } catch {
    body = {};
  }

  const version = body.version?.trim() || "1.0";
  await recordLegalAcceptance(account.id, request.headers.get("x-forwarded-for"), "community_guidelines", version);

  return NextResponse.json({ ok: true, version });
}
