// GET /api/channels/[id] — real implementation of docs/openapi.yaml's `getChannel`. Public.
// PATCH /api/channels/[id] — updates the channel's own settings (name, handle, tagline,
// about, contact email, languages, country). Restricted to accounts with a membership on
// this organization — see channelSettings.ts for why membership alone (not org_role) is
// the bar for now.
import { NextResponse, type NextRequest } from "next/server";
import { getChannelById } from "@/lib/server/catalogue";
import { isChannelMember, updateOrganization, type ChannelSettingsPatch } from "@/lib/server/channelSettings";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const channel = await getChannelById(id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }
    return NextResponse.json(channel);
  } catch (err) {
    console.error(`GET /api/channels/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load channel." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!(await isChannelMember(account.id, id))) {
    return NextResponse.json({ error: "You don't have access to this channel." }, { status: 403 });
  }

  let body: ChannelSettingsPatch;
  try {
    body = (await request.json()) as ChannelSettingsPatch;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await updateOrganization(id, body, { id: account.id, name: account.fullName });
    switch (result.outcome) {
      case "success":
        return NextResponse.json(result.channel);
      case "invalid_handle":
        return NextResponse.json(
          { error: "Handle must be 2-32 characters: lowercase letters, numbers, - or _." },
          { status: 400 },
        );
      case "handle_taken":
        return NextResponse.json({ error: "That handle is already taken." }, { status: 409 });
      case "not_found":
        return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    }
  } catch (err) {
    console.error(`PATCH /api/channels/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update channel." }, { status: 500 });
  }
}
