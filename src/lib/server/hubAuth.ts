// Server-only. How Nexus recognises the MYHitch hub (the MYHitch mobile app's backend)
// and the app customer it's calling for. The hub sends its shared key as X-Api-Key
// (HUB_API_KEY here, NEXUS_HUB_API_KEY on the hub) on every call, and — for a signed-in
// app customer, whose app login the hub has already checked — X-MYHitch-User:
// base64url(JSON {id, email, name}). Only a caller holding the key can name a customer,
// so X-MYHitch-User is never read without hubKeyMatches() passing first.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Whether `provided` is the hub's key. False whenever HUB_API_KEY isn't set. */
export function hubKeyMatches(provided: string | null): boolean {
  const expected = process.env.HUB_API_KEY;
  if (!expected || !provided) return false;
  // Hash both so the comparison is constant-time whatever their lengths.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export interface HubAppUser {
  /** The customer's MYHitch app id. */
  id: string;
  /** Lower-cased. */
  email: string | null;
  name: string | null;
}

/** The app customer from X-MYHitch-User, or null when it's absent or malformed. */
export function readHubAppUser(header: string | null): HubAppUser | null {
  if (!header || header.length > 4096) return null;
  try {
    const raw = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || id.length > 200) return null;
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 200) : "";
    return {
      id,
      email: email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      name: name || null,
    };
  } catch {
    return null;
  }
}
