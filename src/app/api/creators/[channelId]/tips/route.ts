import { NextResponse } from "next/server";
import { listChannelTips } from "@/lib/server/tipping";

export async function GET(
  _request: Request,
  props: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await props.params;
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const tips = await listChannelTips(channelId, 20);
  return NextResponse.json({ tips });
}
