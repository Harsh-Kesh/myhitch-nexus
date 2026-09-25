// GET/POST /api/videos/[id]/comments — reading comments is public (FR-6.1 anonymous
// browsing); posting one needs a real signed-in account. Real videos only — see the
// watchlist route's comment on why.
import { NextResponse, type NextRequest } from "next/server";
import { videoExists } from "@/lib/server/catalogue";
import { getComments, postComment } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  const items = await getComments(id, account?.id ?? null);
  return NextResponse.json({ items });
}

interface CommentBody {
  body?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to leave a comment." }, { status: 401 });
  }

  const { id } = await params;
  let payload: CommentBody;
  try {
    payload = (await request.json()) as CommentBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = payload.body?.trim();
  if (!body) {
    return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  }

  if (!(await videoExists(id))) {
    return NextResponse.json(
      { error: "This title isn't in the real catalogue yet." },
      { status: 404 },
    );
  }

  const comment = await postComment(
    { id: account.id, fullName: account.fullName, handle: account.handle },
    id,
    body,
  );
  return NextResponse.json(comment);
}
