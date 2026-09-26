// POST /api/videos/[id]/product-links/[linkId]/click — public, real click tracking for a
// "Shop this video" product card. `converted: true` means the viewer actually opened the
// product's real target URL, not a confirmed purchase — see recordProductLinkClick()'s
// header for why that distinction matters.
import { NextResponse, type NextRequest } from "next/server";
import { recordProductLinkClick } from "@/lib/server/productLinks";

export async function POST(request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  let body: { converted?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — a plain click with no explicit conversion flag.
  }
  const ok = await recordProductLinkClick(linkId, Boolean(body.converted));
  if (!ok) {
    return NextResponse.json({ error: "Product link not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
