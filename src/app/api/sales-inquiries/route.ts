// POST /api/sales-inquiries — Nexus Enterprise's "Contact Sales" lead capture. No
// self-service checkout for Enterprise (custom pricing) — this creates a real, durable
// lead record an admin can see and action, same "real, honest state" pattern as every
// other lead-gen flow already built (business/leads). Works whether or not the visitor
// is signed in.
import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { getRequestAccount } from "@/lib/server/rbac";

interface SalesInquiryBody {
  fullName?: string;
  email?: string;
  company?: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  let body: SalesInquiryBody;
  try {
    body = (await request.json()) as SalesInquiryBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = body.fullName?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const company = body.company?.trim() || null;
  const message = body.message?.trim() || null;

  if (!fullName || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "A name and a valid email address are required." }, { status: 400 });
  }

  const account = await getRequestAccount(request);

  try {
    await query(
      `insert into sales_inquiries (account_id, full_name, email, company, message)
       values ($1, $2, $3, $4, $5)`,
      [account?.id ?? null, fullName, email, company, message],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/sales-inquiries failed", err);
    return NextResponse.json({ error: "Failed to send your enquiry." }, { status: 500 });
  }
}
