// Server-only. Free, real per-request audience signals for analytics (FR-6.9.2) — no
// vendor, no client instrumentation. This app runs behind Cloudflare (confirmed via
// response headers: Server: cloudflare, cf-cache-status, CF-RAY present on every real
// request), which stamps every proxied request with `cf-ipcountry`; `user-agent` and
// `accept-language` are standard on any real browser request. Country/language names use
// Node's built-in Intl.DisplayNames (no lookup table to maintain, works for every ISO
// code, not just the handful seeded videos happened to use).
import "server-only";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** `cf-ipcountry` is a 2-letter ISO 3166-1 code, or "XX"/"T1" for unknown/Tor — both of
 * which Intl.DisplayNames also can't resolve, so those collapse to null same as absent. */
export function countryFromHeaders(headers: Headers): string | null {
  const code = headers.get("cf-ipcountry");
  if (!code || code.length !== 2) return null;
  try {
    const name = countryNames.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}

/** First (highest-priority) tag from Accept-Language, e.g. "en-GB,en;q=0.9,de;q=0.8" -> "English". */
export function languageFromHeaders(headers: Headers): string | null {
  const header = headers.get("accept-language");
  if (!header) return null;
  const primary = header.split(",")[0]?.trim().split(";")[0]?.split("-")[0];
  if (!primary) return null;
  try {
    const name = languageNames.of(primary.toLowerCase());
    return name && name !== primary.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

const TV_PATTERN = /smart-?tv|googletv|appletv|hbbtv|tizen|web0s|netcast|viera|roku|crkey|aft[a-z]?\d|android tv|bravia/i;
const TABLET_PATTERN = /ipad|tablet|(?:android(?!.*mobile))/i;
const MOBILE_PATTERN = /mobi|iphone|ipod|android/i;

/** Matches the four device labels the mock analytics data already uses (Mobile/Desktop/
 * Connected TV/Tablet) so real and mock rows render identically in the UI. Best-effort:
 * most real Connected TV viewing happens through native apps that never hit this web
 * server, so that category will genuinely be rare/absent for a real channel — an honest
 * reflection of what a web-only UA string can detect, not a bug. */
export function classifyDevice(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  if (!ua) return null;
  if (TV_PATTERN.test(ua)) return "Connected TV";
  if (TABLET_PATTERN.test(ua)) return "Tablet";
  if (MOBILE_PATTERN.test(ua)) return "Mobile";
  return "Desktop";
}
