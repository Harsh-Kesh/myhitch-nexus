// POST /api/admin/categories — real counterpart of the mock's addCategory(). Admin-only.
// Categories themselves are already real and public (GET /api/categories); this is just
// the missing write path.
import { NextResponse, type NextRequest } from "next/server";
import { createCategory } from "@/lib/server/catalogue";
import { recordAudit } from "@/lib/server/moderation";
import { describeAdminTier, getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

interface CreateCategoryBody {
  slug?: string;
  name?: string;
  description?: string;
  contentType?: string;
  featured?: boolean;
  accentToken?: number;
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: CreateCategoryBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.slug || !body.name?.trim() || !body.contentType) {
    return NextResponse.json({ error: "slug, name and contentType are required." }, { status: 400 });
  }

  try {
    const result = await createCategory({
      slug: body.slug,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      contentType: body.contentType,
      featured: body.featured ?? false,
      accentToken: body.accentToken ?? 1,
    });
    if (result.outcome === "slug_taken") {
      return NextResponse.json({ error: "A category with that name already exists." }, { status: 409 });
    }
    await recordAudit({
      actorAccountId: account.id,
      actorName: account.fullName,
      actorRole: describeAdminTier(account.roles),
      action: "config.category_created",
      targetType: "category",
      targetId: result.category.id,
      reason: `Category "${result.category.name}" added from platform settings.`,
      severity: "info",
    });
    return NextResponse.json(result.category);
  } catch (err) {
    console.error("POST /api/admin/categories failed", err);
    return NextResponse.json({ error: "Failed to add the category." }, { status: 500 });
  }
}
