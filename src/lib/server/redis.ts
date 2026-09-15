// Server-only. Lazy singleton Redis client for state that must survive a restart and be
// shared across instances — currently just the login rate limiter (localPassword.ts).
// REDIS_URL is only set in deployed environments (Railway); local dev without it gets no
// client, and callers fall back to an in-memory limiter — the one that was already there,
// not a regression, and still correct for a single local dev process.
import "server-only";
import Redis from "ioredis";

declare global {
  // Reused across hot-reloads in dev, matching db.ts's pool pattern. `null` is a cached
  // "no REDIS_URL configured" result, distinct from "not yet initialized" (undefined).
  var __nexusRedis: Redis | null | undefined;
}

export function getRedis(): Redis | null {
  if (global.__nexusRedis !== undefined) return global.__nexusRedis;

  const url = process.env.REDIS_URL;
  if (!url) {
    global.__nexusRedis = null;
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    // A rate limiter must never block a login request indefinitely waiting on a
    // reconnect — callers treat a thrown error as "Redis unavailable right now" and the
    // caller (localPassword.ts) falls back to allowing the attempt through rather than
    // failing the whole login flow over an infrastructure hiccup.
    retryStrategy: (times) => Math.min(times * 200, 2_000),
  });
  client.on("error", (err) => console.error("[redis] connection error", err));
  global.__nexusRedis = client;
  return client;
}
