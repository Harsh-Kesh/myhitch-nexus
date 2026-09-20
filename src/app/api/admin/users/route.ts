// GET /api/admin/users — real counterpart of the mock's getAdminUsers(). Admin-only.
// POST /api/admin/users — creates an account directly with a one-time temporary
// password (see adminUsers.ts's createAdminUser() header comment). Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminUser, listAdminUsers } from "@/lib/server/adminUsers";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const items = await listAdminUsers();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/users failed", err);
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}

interface CreateUserBody {
  email?: string;
  fullName?: string;
  roles?: string[];
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: CreateUserBody;
  try {
    body = (await request.json()) as CreateUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const fullName = body.fullName?.trim() ?? "";
  const roles = body.roles ?? [];

  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }
  if (roles.length === 0) {
    return NextResponse.json({ error: "At least one role is required." }, { status: 400 });
  }

  try {
    const result = await createAdminUser(
      { id: account.id, name: account.fullName },
      { email, fullName, roles },
    );
    if (result.outcome === "email_taken") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ id: result.id, tempPassword: result.tempPassword });
  } catch (err) {
    console.error("POST /api/admin/users failed", err);
    return NextResponse.json({ error: "Failed to create the user." }, { status: 500 });
  }
}
