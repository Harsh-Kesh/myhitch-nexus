// GET /api/categories/[slug] — one category by slug. Public. The single-item
// counterpart `GET /api/categories` has had since categories first went real — see
// getCategoryBySlug()'s own header comment for why its absence was a real bug.
import { NextResponse } from "next/server";
import { getCategoryBySlug } from "@/lib/server/catalogue";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const category = await getCategoryBySlug(slug);
    if (!category) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    return NextResponse.json(category);
  } catch (err) {
    console.error(`GET /api/categories/${slug} failed`, err);
    return NextResponse.json({ error: "Failed to load the category." }, { status: 500 });
  }
}
