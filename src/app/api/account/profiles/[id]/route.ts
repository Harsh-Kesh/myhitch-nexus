// PATCH & DELETE /api/account/profiles/[id] — Single Family Profile Operations
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  deleteAccountProfile,
  updateAccountProfile,
} from "@/lib/server/familyProfiles";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id: profileId } = await params;

  let body: {
    name?: string;
    avatarUrl?: string;
    isKids?: boolean;
    maturityRating?: "ALL" | "PG" | "TEEN" | "18+";
    pinCode?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const updated = await updateAccountProfile(account.id, profileId, body);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id: profileId } = await params;

  try {
    const success = await deleteAccountProfile(account.id, profileId);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
