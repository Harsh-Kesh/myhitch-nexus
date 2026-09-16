// GET /api/magazine/[slug] — one published article by its public slug. No auth required.
// Only ever resolves published articles — a draft/submitted/rejected piece has no public
// URL, by design.
import { NextResponse } from "next/server";
import { getPublishedArticleBySlug } from "@/lib/server/magazine";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const article = await getPublishedArticleBySlug(slug);
    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }
    return NextResponse.json(article);
  } catch (err) {
    console.error(`GET /api/magazine/${slug} failed`, err);
    return NextResponse.json({ error: "Failed to load the article." }, { status: 500 });
  }
}
