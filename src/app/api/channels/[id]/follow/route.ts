// GET/POST /api/channels/[id]/follow — following status and toggle for the signed-in
// account. Real channels only: channel_follows.organization_id has a foreign key into
// organizations, so a still-mock-shaped channel id can't be followed here at all.
import { NextResponse, type NextRequest } from "next/server";
import { organizationExists } from "@/lib/server/catalogue";
import { isFollowing, toggleFollow } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ following: false });
  }
  const { id } = await params;
  const following = await isFollowing(account.id, id);
  return NextResponse.json({ following });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to follow this channel." }, { status: 401 });
  }

  const { id } = await params;
  if (!(await organizationExists(id))) {
    return NextResponse.json(
      { error: "This channel isn't in the real catalogue yet." },
      { status: 404 },
    );
  }

  if (account.id === id) {
    return NextResponse.json({ error: "Creators cannot follow their own channel." }, { status: 400 });
  }
  const membership = await query(`select 1 from memberships where account_id = $1 and organization_id = $2`, [account.id, id]);
  if (membership.length > 0) {
    return NextResponse.json({ error: "Creators cannot follow their own channel." }, { status: 400 });
  }

  const following = await toggleFollow(account.id, id);
  return NextResponse.json({ following });
}
