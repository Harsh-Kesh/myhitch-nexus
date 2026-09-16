// GET /api/magazine/articles/[id] — one of the signed-in account's own articles, any
// status. PATCH — edit the working draft (title/dek/body) while it's still editable.
import { NextResponse, type NextRequest } from "next/server";
import { getArticleById, updateDraftArticle } from "@/lib/server/magazine";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const article = await getArticleById(id);
    if (!article || article.authorAccountId !== account.id) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }
    return NextResponse.json(article);
  } catch (err) {
    console.error(`GET /api/magazine/articles/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load the article." }, { status: 500 });
  }
}

interface PatchBody {
  title?: string;
  dek?: string | null;
  bodyHtml?: string;
  aboutTitle?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await updateDraftArticle(id, account.id, body);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Article not found." }, { status: 404 });
      case "not_editable":
        return NextResponse.json(
          { error: "This article can't be edited once it's submitted or published." },
          { status: 409 },
        );
      case "success":
        return NextResponse.json(result.article);
    }
  } catch (err) {
    console.error(`PATCH /api/magazine/articles/${id} failed`, err);
    return NextResponse.json({ error: "Failed to save changes." }, { status: 500 });
  }
}
