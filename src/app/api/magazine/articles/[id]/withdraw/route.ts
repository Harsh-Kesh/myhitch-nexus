// POST /api/magazine/articles/[id]/withdraw — author-initiated pull, any time before
// publication (no need to wait on a reviewer to change your mind).
import { NextResponse, type NextRequest } from "next/server";
import { withdrawArticle } from "@/lib/server/magazine";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const result = await withdrawArticle(id, account.id);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Article not found." }, { status: 404 });
      case "invalid_transition":
        return NextResponse.json({ error: "A published article can't be withdrawn this way." }, { status: 409 });
      case "success":
        return NextResponse.json(result.article);
    }
  } catch (err) {
    console.error(`POST /api/magazine/articles/${id}/withdraw failed`, err);
    return NextResponse.json({ error: "Failed to withdraw the article." }, { status: 500 });
  }
}
