// GET /api/categories — real implementation of docs/openapi.yaml's `getCategories`. Public.
import { NextResponse } from "next/server";
import { listCategories } from "@/lib/server/catalogue";

export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ items: categories });
  } catch (err) {
    console.error("GET /api/categories failed", err);
    return NextResponse.json({ error: "Failed to load categories." }, { status: 500 });
  }
}
