// POST /api/studio/bulk-import/parse — real CSV manifest parsing + validation for the
// Studio "Bulk import" panel. No DB write here; see .../commit for staging the
// reviewed rows as real draft videos.
import { NextResponse, type NextRequest } from "next/server";
import { parseBulkImportCsv } from "@/lib/server/bulkImport";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["producer"])) {
    return NextResponse.json({ error: "Nexus Enterprise required." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size > MAX_MANIFEST_BYTES) {
    return NextResponse.json({ error: "Manifest must be under 2MB." }, { status: 400 });
  }

  const text = await file.text();
  const result = parseBulkImportCsv(text);
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ rows: result.rows });
}
