import type {
  AdminCase,
  AppNotification,
  AuditLogEntry,
  Campaign,
  Category,
  ChatMessage,
  Comment,
  LiveEvent,
  ModerationItem,
  Organisation,
  PlatformConfigTables,
  Playlist,
  Rating,
  Series,
  Subscription,
  UploadSession,
  User,
  Video,
  WatchProgress,
} from "./types";

import { adminCases, adminUsers, auditLog, moderationQueue, organisations, platformConfig } from "./data/admin";
import { campaigns, leads, productLinks } from "./data/advertising";
import { categories } from "./data/categories";
import { channels } from "./data/channels";
import { playlists, series } from "./data/collections";
import { chatMessages, liveEvents, polls } from "./data/live";
import { comments, ratings } from "./data/social";
import {
  currentUser,
  following,
  notifications,
  purchases,
  subscriptions,
  watchProgress,
  watchlist,
} from "./data/users";
import { videos } from "./data/videos";

/**
 * A single mutable in-memory store, seeded from the fixture modules.
 *
 * Everything the UI writes — a published upload, a submitted campaign, a
 * moderation decision — lands here so the acceptance-criteria journeys join up
 * across screens within a session. Nothing is persisted; a reload reseeds.
 *
 * Structured as one object so swapping in a real API later means replacing the
 * functions in ./index.ts, not rewriting component code.
 */
export interface MockStore {
  videos: Video[];
  channels: typeof channels;
  categories: Category[];
  series: Series[];
  playlists: Playlist[];
  comments: Comment[];
  ratings: Rating[];
  liveEvents: LiveEvent[];
  chatMessages: ChatMessage[];
  polls: typeof polls;
  user: User;
  following: string[];
  watchlist: string[];
  watchProgress: WatchProgress[];
  purchases: typeof purchases;
  subscriptions: Subscription[];
  notifications: AppNotification[];
  campaigns: Campaign[];
  leads: typeof leads;
  productLinks: typeof productLinks;
  moderationQueue: ModerationItem[];
  auditLog: AuditLogEntry[];
  adminUsers: typeof adminUsers;
  organisations: Organisation[];
  adminCases: AdminCase[];
  config: PlatformConfigTables;
  uploadSessions: Record<string, UploadSession>;
  /** Videos the current viewer has unlocked this session (mock checkout). */
  unlocked: Record<string, { kind: "buy" | "rent" | "ppv" | "ticket"; expiresAt: string | null }>;
  /** Simulated request country — the geo-restriction demo toggles this. */
  requestCountry: string;
  seq: number;
  /** Whether the mock session is authenticated. False = guest/unauthenticated. */
  loggedIn: boolean;
}

/**
 * The rest of the store deliberately does not persist — a reload should
 * reseed the catalogue, purchases, comments etc. back to a clean demo state.
 * Login is the one exception: without this, protected routes (Account behind
 * the client AuthGuard; Studio/Admin/Business behind their own server-side
 * requireRole() now — see src/lib/server/rbac.ts; video pages via their own
 * inline redirect) would sign a viewer back out on every refresh, direct
 * link or new tab, which no real session behaves like.
 */
const LOGIN_STORAGE_KEY = "nx-logged-in";

function readPersistedLogin(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(LOGIN_STORAGE_KEY) === "true";
}

export function persistLogin(loggedIn: boolean) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOGIN_STORAGE_KEY, String(loggedIn));
}

/** Same reasoning as LOGIN_STORAGE_KEY above, for the same reason: which household
 * profile is active has nowhere real to live server-side (no such column exists on
 * accounts or account_profiles — confirmed by reading the schema), so it only ever lived
 * in this in-memory store singleton. That meant it reset to the account's default "self"
 * profile on every fresh load of getCurrentUser() — a real bug found live 2026-09-26: a
 * PIN-verified switch to a real profile appeared to work (the toast confirmed it) but the
 * header's own next refetch of the current user silently reverted to the previous
 * profile, because nothing had told it a different choice had just been made. */
export const ACTIVE_PROFILE_STORAGE_KEY = "nx-active-profile";

export function readPersistedActiveProfile(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
}

export function persistActiveProfile(profileId: string | null) {
  if (typeof window === "undefined") return;
  if (profileId) {
    window.sessionStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  } else {
    window.sessionStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
  }
}

function seed(): MockStore {
  return {
    videos: videos.map((video) => ({ ...video })),
    channels: channels.map((channel) => ({ ...channel })),
    categories: categories.map((category) => ({ ...category })),
    series: series.map((item) => ({ ...item })),
    playlists: playlists.map((playlist) => ({ ...playlist })),
    comments: comments.map((comment) => ({ ...comment })),
    ratings: [...ratings],
    liveEvents: liveEvents.map((event) => ({ ...event })),
    chatMessages: [...chatMessages],
    polls: polls.map((poll) => ({ ...poll })),
    user: { ...currentUser },
    following: [...following],
    watchlist: [...watchlist],
    watchProgress: watchProgress.map((entry) => ({ ...entry })),
    purchases: purchases.map((purchase) => ({ ...purchase })),
    subscriptions: subscriptions.map((subscription) => ({ ...subscription })),
    notifications: notifications.map((notification) => ({ ...notification })),
    campaigns: campaigns.map((campaign) => ({ ...campaign })),
    leads: leads.map((lead) => ({ ...lead })),
    productLinks: productLinks.map((link) => ({ ...link })),
    moderationQueue: moderationQueue.map((item) => ({ ...item })),
    auditLog: auditLog.map((entry) => ({ ...entry })),
    adminUsers: adminUsers.map((row) => ({ ...row })),
    organisations: organisations.map((org) => ({ ...org })),
    adminCases: adminCases.map((item) => ({ ...item })),
    config: JSON.parse(JSON.stringify(platformConfig)) as PlatformConfigTables,
    uploadSessions: {},
    unlocked: {},
    requestCountry: "GB",
    seq: 1000,
    loggedIn: readPersistedLogin(),
  };
}

/**
 * Kept on globalThis so Next's dev-mode module reloading doesn't wipe state
 * mid-journey, and so server and client copies stay independent but consistent.
 */
const globalRef = globalThis as unknown as { __nexusStore?: MockStore };

export const store: MockStore = globalRef.__nexusStore ?? seed();
if (!globalRef.__nexusStore) globalRef.__nexusStore = store;

export function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}_${store.seq}`;
}

export function resetStore() {
  Object.assign(store, seed());
}

/** Every write goes through here so the audit log is never an afterthought. */
export function recordAudit(
  entry: Omit<AuditLogEntry, "id" | "createdAt" | "ip"> &
    Partial<Pick<AuditLogEntry, "createdAt" | "ip">>,
): AuditLogEntry {
  const record: AuditLogEntry = {
    id: nextId("aud"),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    ip: entry.ip ?? "10.24.8.117",
    ...entry,
  };
  store.auditLog = [record, ...store.auditLog];
  return record;
}
