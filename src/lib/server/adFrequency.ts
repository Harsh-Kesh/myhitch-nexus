// Server-only. Per-viewer ad frequency capping — signed-in viewers only (see the
// ad-serving plan's own "deliberately not building" section: there's no anonymous-id
// cookie mechanism anywhere in this codebase to key a guest cap by). Same Redis-backed,
// in-memory-fallback shape as localPassword.ts's login rate limiter (getRedis(), fail
// open on a Redis error, a plain Map for local dev without REDIS_URL) — read-count and
// increment are deliberately separate calls: /api/ads/serve only reads the count to
// decide eligibility, /api/ads/impression increments it once an impression is actually
// confirmed, so a served-but-unwatched ad never counts against the cap.
import "server-only";
import { getRedis } from "./redis";

const memoryCounts = new Map<string, { count: number; expiresAt: number }>();

function freqKey(accountId: string, campaignId: string): string {
  return `ad-freq:${accountId}:${campaignId}`;
}

export async function getFrequencyCount(accountId: string, campaignId: string): Promise<number> {
  const key = freqKey(accountId, campaignId);
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get(key);
      return value ? Number(value) : 0;
    } catch (err) {
      console.error("[adFrequency] Redis getFrequencyCount failed, failing open", err);
      return 0;
    }
  }
  const entry = memoryCounts.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return 0;
  return entry.count;
}

export async function incrementFrequency(accountId: string, campaignId: string, windowHours: number): Promise<void> {
  const key = freqKey(accountId, campaignId);
  const windowSeconds = Math.max(1, Math.round(windowHours * 3600));
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
    } catch (err) {
      console.error("[adFrequency] Redis incrementFrequency failed, impression not counted toward cap", err);
    }
    return;
  }
  const entry = memoryCounts.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryCounts.set(key, { count: 1, expiresAt: Date.now() + windowSeconds * 1000 });
  } else {
    entry.count += 1;
  }
}
