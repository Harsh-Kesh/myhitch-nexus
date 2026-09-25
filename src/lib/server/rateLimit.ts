// Server-only. Generic fixed-window rate limiter — the same Redis-backed,
// in-memory-fallback shape localPassword.ts (login attempts), adFrequency.ts (ad
// frequency caps), and profilePin.ts (PIN attempts) each already implement separately.
// Pulled out here as one shared primitive for the money/spam-adjacent surfaces that had
// no rate limiting at all (tips, team invitations, community comments, API key
// creation) — found during the 2026-09-24 platform audit as a blanket gap across that
// whole batch of new work.
import "server-only";
import { getRedis } from "./redis";

const memoryCounts = new Map<string, { count: number; expiresAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  /** How many requests remain in the current window, clamped at 0. */
  remaining: number;
}

/** `key` should already include the action name (e.g. `tip:${accountId}`) so different
 * actions never share a counter. Fails open on a Redis error — rate limiting is
 * defense-in-depth on top of the real checks (auth, ownership, validation), not the
 * boundary itself, so an infrastructure hiccup should never block a legitimate request. */
export async function checkRateLimit(key: string, maxPerWindow: number, windowSeconds: number): Promise<RateLimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      return { allowed: count <= maxPerWindow, remaining: Math.max(0, maxPerWindow - count) };
    } catch (err) {
      console.error(`[rateLimit] Redis check failed for "${key}", failing open`, err);
      return { allowed: true, remaining: maxPerWindow };
    }
  }

  const entry = memoryCounts.get(key);
  const now = Date.now();
  if (!entry || entry.expiresAt <= now) {
    memoryCounts.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxPerWindow - 1 };
  }
  entry.count += 1;
  return { allowed: entry.count <= maxPerWindow, remaining: Math.max(0, maxPerWindow - entry.count) };
}
