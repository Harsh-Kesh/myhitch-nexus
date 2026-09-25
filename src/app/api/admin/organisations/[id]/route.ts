// PATCH /api/admin/organisations/[id] — real counterpart of the mock's
// updateOrganisationStatus(), plus the real Business-vs-Enterprise seat limit (super-admin
// only — a platform-config change, not a content/brand-safety verification decision).
import { NextResponse, type NextRequest } from "next/server";
import { decideOrganisationVerification, setOrganizationSeatLimit } from "@/lib/server/adminOrganizations";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: { status?: "verified" | "rejected"; reason?: string; seatLimit?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.seatLimit !== undefined) {
    if (!hasAnyRole(account, ["super-admin"])) {
      return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });
    }
    if (body.seatLimit !== null && (!Number.isInteger(body.seatLimit) || body.seatLimit < 1)) {
      return NextResponse.json({ error: "seatLimit must be a positive integer or null (unlimited)." }, { status: 400 });
    }
    const result = await setOrganizationSeatLimit(
      { id: account.id, name: account.fullName, roles: account.roles },
      id,
      body.seatLimit,
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!hasAnyRole(account, ["moderator", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  if (body.status !== "verified" && body.status !== "rejected") {
    return NextResponse.json({ error: "status must be 'verified' or 'rejected'." }, { status: 400 });
  }

  try {
    const result = await decideOrganisationVerification(
      { id: account.id, name: account.fullName, roles: account.roles },
      id,
      body.status,
      body.reason?.trim() ?? "",
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`PATCH /api/admin/organisations/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the organisation." }, { status: 500 });
  }
}
