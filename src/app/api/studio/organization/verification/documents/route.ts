// GET/POST /api/studio/organization/verification/documents — business registration
// evidence, licences, insurance certificates. Small files, so uploaded through our own
// server (multipart), same shape as /api/studio/thumbnails, into the private
// business-documents bucket.
import { NextResponse, type NextRequest } from "next/server";
import { listVerificationDocuments, uploadVerificationDocument } from "@/lib/server/organizationVerification";
import { getRequestAccount } from "@/lib/server/rbac";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(["business_registration", "licence", "insurance", "other"]);

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }

  try {
    const result = await listVerificationDocuments(account.id, organizationId);
    if (result.outcome === "not_member") {
      return NextResponse.json({ error: "You aren't a member of that organisation." }, { status: 403 });
    }
    return NextResponse.json({ items: result.documents });
  } catch (err) {
    console.error("GET /api/studio/organization/verification/documents failed", err);
    return NextResponse.json({ error: "Failed to load documents." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const organizationId = form.get("organizationId");
  const documentType = form.get("documentType");
  const file = form.get("file");
  if (typeof organizationId !== "string" || !organizationId) {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }
  if (typeof documentType !== "string" || !DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: "A valid documentType is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "File must be under 20MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadVerificationDocument(
      account.id,
      organizationId,
      documentType as "business_registration" | "licence" | "insurance" | "other",
      file.name,
      buffer,
      file.type || "application/octet-stream",
    );
    if (result.outcome === "not_member") {
      return NextResponse.json({ error: "You aren't a member of that organisation." }, { status: 403 });
    }
    return NextResponse.json({ id: result.id, fileName: result.fileName }, { status: 201 });
  } catch (err) {
    console.error("POST /api/studio/organization/verification/documents failed", err);
    return NextResponse.json({ error: "Failed to upload the document." }, { status: 500 });
  }
}
