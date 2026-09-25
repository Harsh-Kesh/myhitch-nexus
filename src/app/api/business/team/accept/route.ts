// POST /api/business/team/accept — Accept an invitation to join a business team
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { acceptInvitation } from "@/lib/server/teamInvitations";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required to accept team invitation" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.token || !body.token.trim()) {
    return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
  }

  try {
    const result = await acceptInvitation(body.token.trim(), account.id, account.email);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to accept invitation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
