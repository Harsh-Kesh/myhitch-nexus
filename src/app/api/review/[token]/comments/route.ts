// GET/POST /api/review/[token]/comments — real timecoded feedback on a client review.
// Public, same trust model as /api/review/[token] itself: the token is what authorizes
// access, there's no login for an external client.
import { NextResponse, type NextRequest } from "next/server";
import { getClientReviewByToken } from "@/lib/server/enterprise";
import { addReviewComment, listReviewComments } from "@/lib/server/enterprise";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reviewData = await getClientReviewByToken(token);
  if (!reviewData) {
    return NextResponse.json({ error: "Review link not found or has expired." }, { status: 404 });
  }
  const comments = await listReviewComments(reviewData.review.id);
  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reviewData = await getClientReviewByToken(token);
  if (!reviewData) {
    return NextResponse.json({ error: "Review link not found or has expired." }, { status: 404 });
  }

  let body: { authorName?: string; timestampSeconds?: number; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Comment text is required." }, { status: 400 });
  }

  const comment = await addReviewComment(
    reviewData.review.id,
    body.authorName || reviewData.review.client_name,
    body.timestampSeconds ?? 0,
    body.content,
  );
  if (!comment) {
    return NextResponse.json({ error: "Couldn't add comment." }, { status: 500 });
  }
  return NextResponse.json({ comment }, { status: 201 });
}
