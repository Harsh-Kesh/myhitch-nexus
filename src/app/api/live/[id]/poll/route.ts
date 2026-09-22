// GET & POST /api/live/[id]/poll — Live stream polls & voting (FR-6.5.4)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  createLivePoll,
  endLivePoll,
  getActivePoll,
  voteLivePoll,
} from "@/lib/server/liveChat";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params;
  const account = await getRequestAccount(request);

  const poll = await getActivePoll(streamId, account?.id ?? null);
  return NextResponse.json({ poll });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params;
  const account = await getRequestAccount(request);

  let body: {
    action: "create" | "vote" | "end";
    question?: string;
    options?: string[];
    pollId?: string;
    optionIndex?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "create") {
    if (!body.question || !Array.isArray(body.options) || body.options.length < 2) {
      return NextResponse.json(
        { error: "question and at least 2 options are required" },
        { status: 400 },
      );
    }
    try {
      const poll = await createLivePoll(streamId, body.question, body.options);
      return NextResponse.json({ poll }, { status: 201 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create poll";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.action === "vote") {
    if (!body.pollId || typeof body.optionIndex !== "number") {
      return NextResponse.json(
        { error: "pollId and optionIndex are required" },
        { status: 400 },
      );
    }

    if (!account) {
      return NextResponse.json(
        { error: "Sign in required to vote on live stream polls" },
        { status: 401 },
      );
    }

    try {
      const updatedPoll = await voteLivePoll(body.pollId, account.id, body.optionIndex);
      return NextResponse.json({ poll: updatedPoll });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to vote on poll";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.action === "end") {
    if (!body.pollId) {
      return NextResponse.json({ error: "pollId is required" }, { status: 400 });
    }
    const ended = await endLivePoll(body.pollId, streamId);
    return NextResponse.json({ success: ended });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
