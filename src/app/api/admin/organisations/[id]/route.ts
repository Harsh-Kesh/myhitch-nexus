// PATCH /api/admin/organisations/[id] — real counterpart of the mock's
// updateOrganisationStatus(). Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { decideOrganisationVerification } from "@/lib/server/adminOrganizations";
import { getRequestAccount } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: { status?: "verified" | "rejected"; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (body.status !== "verified" && body.status !== "rejected") {
    return NextResponse.json({ error: "status must be 'verified' or 'rejected'." }, { status: 400 });
  }

  try {
    const result = await decideOrganisationVerification(
      { id: account.id, name: account.fullName },
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
