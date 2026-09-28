// POST /api/studio/bulk-import/commit — stages the reviewed (non-error) manifest rows
// as real draft videos. Takes the already-parsed rows back from the client rather than
// re-parsing the file, so a creator's inline edits to the preview table before
// confirming are respected.
import { NextResponse, type NextRequest } from "next/server";
import { stageBulkImportDrafts, type BulkImportParsedRow } from "@/lib/server/bulkImport";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["producer"])) {
    return NextResponse.json({ error: "Nexus Enterprise required." }, { status: 403 });
  }

  let body: { channelId?: string; rows?: BulkImportParsedRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }

  const result = await stageBulkImportDrafts(account.id, body.channelId, body.rows);
  if (result.outcome === "not_channel_member") {
    return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
  }
  return NextResponse.json({ staged: result.staged });
}
