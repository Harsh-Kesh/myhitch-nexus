// GET /api/sponsorship/[slug] — one published listing by its public slug. No auth
// required. Only ever resolves published listings — a draft/submitted/rejected listing
// has no public URL, by design.
import { NextResponse } from "next/server";
import { getPublishedListingBySlug } from "@/lib/server/sponsorship";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const listing = await getPublishedListingBySlug(slug);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    return NextResponse.json(listing);
  } catch (err) {
    console.error(`GET /api/sponsorship/${slug} failed`, err);
    return NextResponse.json({ error: "Failed to load the listing." }, { status: 500 });
  }
}
