import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1_234_567 -> "1.2M". Used for view counts, followers, impressions. */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.round(value));
  const units = [
    { limit: 1e12, suffix: "T" },
    { limit: 1e9, suffix: "B" },
    { limit: 1e6, suffix: "M" },
    { limit: 1e3, suffix: "K" },
  ];
  for (const { limit, suffix } of units) {
    if (abs >= limit) {
      const scaled = value / limit;
      const digits = Math.abs(scaled) < 10 ? 1 : 0;
      return `${scaled.toFixed(digits).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return String(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(Math.round(value));
}

export function formatCurrency(
  amountMinor: number,
  currency = "GBP",
  opts: { compact?: boolean } = {},
): string {
  const amount = amountMinor / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 2,
    minimumFractionDigits: opts.compact ? 0 : 2,
  }).format(amount);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** 3725 -> "1:02:05" ; 125 -> "2:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** 6960 -> "PT1H56M0S". For schema.org VideoObject.duration (JSON-LD wants ISO 8601). */
export function isoDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return `PT${hours > 0 ? `${hours}H` : ""}${minutes > 0 ? `${minutes}M` : ""}${seconds}S`;
}

/** Long form used in metadata blocks: "1h 2m" / "45m" / "38s" */
export function formatRuntime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${s}s`;
}

export function formatWatchHours(seconds: number): string {
  return `${compactNumber(Math.round(seconds / 3600))} hrs`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(
  input: string | Date,
  style: "short" | "medium" | "long" = "medium",
): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "2-digit", month: "short" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Relative time. Deterministic against a caller-supplied `now` so server and
 * client renders agree — passing no `now` is fine in client components only.
 */
export function relativeTime(input: string | Date, now: Date = new Date()) {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let previous = 1;
  for (const [limit, unit] of divisions) {
    if (abs < limit) return rtf.format(Math.round(diffSeconds / previous), unit);
    previous = limit === 60 ? 60 : limit;
  }
  return rtf.format(Math.round(diffSeconds / 31557600), "year");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCase(input: string): string {
  return input
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function groupBy<T, K extends string>(
  items: T[],
  key: (item: T) => K,
): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const group = key(item);
      (acc[group] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Small deterministic PRNG. Mock data must be identical on server and client,
 * so nothing in this project calls Math.random() at render time.
 */
export function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Stable pseudo-id for mock records created in-session. */
let idCounter = 0;
export function mockId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString().padStart(4, "0")}`;
}

// Single source of truth for the site's own origin — also used by src/app/layout.tsx's
// metadataBase and src/app/sitemap.ts. Hardcoded fallback rather than localhost: a
// relative image URL silently resolving against localhost would break every social/
// crawler preview in production if the env var were ever unset (found 2026-09-14 —
// that's exactly what had happened to sitemap.xml's own, separate fallback).
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://myhitchnexus.com.au";

/**
 * Resolves a possibly-relative path (as stored in the DB/mock data, e.g.
 * "/images/posters/x.png") to an absolute URL. Needed for JSON-LD image/logo fields —
 * unlike Next's `openGraph.images`, metadataBase does not auto-absolutize those.
 */
export function absoluteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (typeof window !== "undefined" && window.location.pathname.startsWith("/myhitch-nexus")
    ? "/myhitch-nexus"
    : process.env.GITHUB_ACTIONS === "true"
      ? "/myhitch-nexus"
      : "");

/**
 * Resolves static asset paths (e.g. `/images/brand/logo.png`) to respect the
 * deployment base path on GitHub Pages (`/myhitch-nexus`).
 */
export function assetPath(path: string): string {
  if (!path) return "";
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (BASE_PATH && !clean.startsWith(BASE_PATH)) {
    return `${BASE_PATH}${clean}`;
  }
  return clean;
}

