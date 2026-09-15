// POST /api/auth/logout — revokes the session server-side (not just clearing the
// cookie), so a stolen cookie can't keep working after the user logs out.
import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, readSessionToken, revokeSession } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  const token = readSessionToken(request);
  if (token) {
    await revokeSession(token);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
