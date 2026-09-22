// PATCH /api/admin/categories/[id] — the only category field /admin/settings edits
// post-creation, the "Featured" switch. Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { updateCategoryFeatured } from "@/lib/server/catalogue";
import { recordAudit } from "@/lib/server/moderation";
import { describeAdminTier, getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: { featured?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.featured !== "boolean") {
    return NextResponse.json({ error: "featured must be a boolean." }, { status: 400 });
  }

  try {
    const found = await updateCategoryFeatured(id, body.featured);
    if (!found) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    await recordAudit({
      actorAccountId: account.id,
      actorName: account.fullName,
      actorRole: describeAdminTier(account.roles),
      action: "config.categories_updated",
      targetType: "category",
      targetId: id,
      reason: `Featured set to ${body.featured} from platform settings.`,
      severity: "notice",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`PATCH /api/admin/categories/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the category." }, { status: 500 });
  }
}
