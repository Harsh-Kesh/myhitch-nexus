// GET/POST/DELETE /api/business/product-links — real "Shop this video" product links for
// the signed-in account's own organization.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { resolveOrgIdForAccount, NoOrganizationError } from "@/lib/server/enterprise";
import { createProductLink, deleteProductLink, listProductLinks } from "@/lib/server/productLinks";

async function requireOrg(request: NextRequest): Promise<{ orgId: string } | { error: NextResponse }> {
  const account = await getRequestAccount(request);
  if (!account) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  try {
    return { orgId: await resolveOrgIdForAccount(account.id) };
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return { error: NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 }) };
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const links = await listProductLinks(resolved.orgId);
  return NextResponse.json({ links });
}

export async function POST(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  let body: {
    productName?: string;
    martProductId?: string;
    imageUrl?: string;
    priceCents?: number;
    currency?: string;
    commissionRate?: number;
    targetUrl?: string;
    attachedVideoIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.productName || typeof body.priceCents !== "number") {
    return NextResponse.json({ error: "productName and priceCents are required." }, { status: 400 });
  }

  const result = await createProductLink(resolved.orgId, {
    productName: body.productName,
    martProductId: body.martProductId,
    imageUrl: body.imageUrl,
    priceCents: body.priceCents,
    currency: body.currency,
    commissionRate: body.commissionRate,
    targetUrl: body.targetUrl,
    attachedVideoIds: body.attachedVideoIds,
  });
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ link: result.link }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const linkId = request.nextUrl.searchParams.get("id");
  if (!linkId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  const result = await deleteProductLink(resolved.orgId, linkId);
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Product link not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
