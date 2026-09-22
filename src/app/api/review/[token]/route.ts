// Client Review Workflow: Public Token-based API (GET & POST)
import { NextResponse, type NextRequest } from "next/server";
import {
  getClientReviewByToken,
  submitClientReviewFeedback,
} from "@/lib/server/enterprise";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Review token is required" }, { status: 400 });
  }

  const reviewData = await getClientReviewByToken(token);
  if (!reviewData) {
    return NextResponse.json(
      { error: "Review link not found or has expired." },
      { status: 404 },
    );
  }

  return NextResponse.json(reviewData);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Review token is required" }, { status: 400 });
  }

  let body: {
    status?: "approved" | "changes_requested";
    feedback?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "approved" && body.status !== "changes_requested") {
    return NextResponse.json(
      { error: "Status must be 'approved' or 'changes_requested'" },
      { status: 400 },
    );
  }

  const updated = await submitClientReviewFeedback(
    token,
    body.status,
    body.feedback,
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Review not found or has expired." },
      { status: 404 },
    );
  }

  return NextResponse.json({ review: updated });
}
