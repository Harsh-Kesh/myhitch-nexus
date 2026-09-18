// POST /api/copyright/claims — public copyright-claim intake, no account required (same
// as a real DMCA notice). Restricts the video immediately on a well-formed notice — see
// copyright.ts's submitCopyrightClaim() header comment for why.
import { NextResponse, type NextRequest } from "next/server";
import { submitCopyrightClaim } from "@/lib/server/copyright";

interface ClaimBody {
  videoId?: string;
  claimantName?: string;
  claimantEmail?: string;
  claimantOrganization?: string;
  workDescription?: string;
  infringementDescription?: string;
  goodFaithStatement?: boolean;
  accuracyStatement?: boolean;
}

export async function POST(request: NextRequest) {
  let body: ClaimBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const claimantName = body.claimantName?.trim();
  const claimantEmail = body.claimantEmail?.trim();
  const workDescription = body.workDescription?.trim();
  const infringementDescription = body.infringementDescription?.trim();

  if (
    !videoId ||
    !claimantName ||
    !claimantEmail ||
    !/.+@.+\..+/.test(claimantEmail) ||
    !workDescription ||
    !infringementDescription
  ) {
    return NextResponse.json(
      { error: "videoId, claimantName, a valid claimantEmail, workDescription and infringementDescription are required." },
      { status: 400 },
    );
  }

  try {
    const result = await submitCopyrightClaim({
      videoId,
      claimantName,
      claimantEmail,
      claimantOrganization: body.claimantOrganization?.trim() || null,
      workDescription,
      infringementDescription,
      goodFaithStatement: body.goodFaithStatement === true,
      accuracyStatement: body.accuracyStatement === true,
    });
    switch (result.outcome) {
      case "success":
        return NextResponse.json(result.case);
      case "video_not_found":
        return NextResponse.json({ error: "That video couldn't be found." }, { status: 404 });
      case "statements_required":
        return NextResponse.json(
          { error: "You must confirm both the good-faith belief and accuracy statements." },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("POST /api/copyright/claims failed", err);
    return NextResponse.json({ error: "Failed to submit the claim." }, { status: 500 });
  }
}
