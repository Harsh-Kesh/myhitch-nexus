// PATCH /api/admin/enterprise/[id] — approve (with a real negotiated price) or reject a
// real Enterprise application. Super-admin only (see route.ts's own header for why).
import { NextResponse, type NextRequest } from "next/server";
import { approveEnterpriseApplication, rejectEnterpriseApplication } from "@/lib/server/adminEnterprise";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: {
    status?: "approved" | "rejected";
    priceMinor?: number;
    billingInterval?: "month" | "year";
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const admin = { id: account.id, name: account.fullName, roles: account.roles };
  const notes = body.notes?.trim() ?? "";

  try {
    if (body.status === "rejected") {
      const result = await rejectEnterpriseApplication(admin, id, notes);
      if (result.outcome === "not_found") {
        return NextResponse.json({ error: "Organization not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    if (!Number.isInteger(body.priceMinor) || (body.priceMinor as number) <= 0) {
      return NextResponse.json({ error: "A valid price is required to approve." }, { status: 400 });
    }
    if (body.billingInterval !== "month" && body.billingInterval !== "year") {
      return NextResponse.json({ error: "billingInterval must be 'month' or 'year'." }, { status: 400 });
    }

    const result = await approveEnterpriseApplication(
      admin,
      id,
      body.priceMinor as number,
      body.billingInterval,
      notes,
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`PATCH /api/admin/enterprise/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the application." }, { status: 500 });
  }
}
