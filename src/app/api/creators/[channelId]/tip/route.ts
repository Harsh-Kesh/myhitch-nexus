import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRequestAccount } from "@/lib/server/rbac";
import { createTipCheckoutSession } from "@/lib/server/tipping";
import { query } from "@/lib/server/db";

const TipSchema = z.object({
  supporterName: z.string().min(1).default("Anonymous Fan"),
  supporterEmail: z.string().email().optional().nullable(),
  amountCents: z.number().int().min(100),
  currency: z.string().default("aud"),
  message: z.string().max(500).optional().nullable(),
  isPatron: z.boolean().default(false),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await props.params;
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const account = await getRequestAccount(request);
  if (account) {
    const membership = await query(
      `select 1 from memberships where account_id = $1 and organization_id = $2`,
      [account.id, channelId],
    );
    if (membership.length > 0 || account.id === channelId) {
      return NextResponse.json(
        { error: "Creators cannot tip or support their own channel." },
        { status: 400 },
      );
    }
  }

  try {
    const result = await createTipCheckoutSession({
      channelId,
      accountId: account?.id ?? null,
      supporterName: parsed.data.supporterName,
      supporterEmail: parsed.data.supporterEmail ?? account?.email ?? null,
      amountCents: parsed.data.amountCents,
      currency: parsed.data.currency,
      message: parsed.data.message ?? null,
      isPatron: parsed.data.isPatron,
      successUrl: parsed.data.successUrl,
      cancelUrl: parsed.data.cancelUrl,
    });

    if (result.outcome === "invalid_amount") {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to create tip checkout session:", err);
    return NextResponse.json(
      { error: "Failed to process tip checkout" },
      { status: 500 },
    );
  }
}
