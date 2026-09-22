// GET & POST /api/account/profiles — Family Profiles Management (Family Tier)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  createAccountProfile,
  listAccountProfiles,
} from "@/lib/server/familyProfiles";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const overview = await listAccountProfiles(account.id);
    return NextResponse.json(overview);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list profiles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: {
    name?: string;
    avatarUrl?: string;
    isKids?: boolean;
    maturityRating?: "ALL" | "PG" | "TEEN" | "18+";
    pinCode?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
  }

  try {
    const profile = await createAccountProfile(account.id, {
      name: body.name.trim(),
      avatarUrl: body.avatarUrl,
      isKids: body.isKids,
      maturityRating: body.maturityRating,
      pinCode: body.pinCode,
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
