import type {
  AppNotification,
  NotificationChannels,
  NotificationEvent,
  PurchaseRecord,
  Subscription,
  User,
  WatchProgress,
} from "../types";
import { daysAgo, daysAhead, hoursAgo } from "./videos";

export const NOTIFICATION_EVENT_LABELS: Record<
  NotificationEvent,
  { title: string; description: string }
> = {
  "new-upload": {
    title: "New uploads",
    description: "A channel you follow publishes something new.",
  },
  "live-starting": {
    title: "Live starting",
    description: "A scheduled stream you saved is about to begin.",
  },
  reply: {
    title: "Replies",
    description: "Someone replies to your comment.",
  },
  mention: {
    title: "Mentions",
    description: "You are mentioned in a comment or live chat.",
  },
  "purchase-receipt": {
    title: "Receipts",
    description: "Confirmation for a purchase, rental or ticket.",
  },
  "rental-expiring": {
    title: "Rental expiring",
    description: "A rental window is close to ending.",
  },
  payout: {
    title: "Payouts",
    description: "Payout scheduled, sent or failed.",
  },
  policy: {
    title: "Policy & safety",
    description: "Moderation decisions and policy updates affecting you.",
  },
};

const on: NotificationChannels = { email: true, push: true, inApp: true };
const inAppOnly: NotificationChannels = {
  email: false,
  push: false,
  inApp: true,
};
const emailOnly: NotificationChannels = {
  email: true,
  push: false,
  inApp: true,
};

/**
 * The signed-in mock user. Every role in §6 is present so role-switching in the
 * header can move between viewer, studio, business and admin surfaces without
 * a second account.
 */
export const currentUser: User = {
  id: "usr_viewer",
  name: "Mara Solace",
  email: "mara@marasolace.example",
  handle: "marasolace",
  roles: ["viewer", "creator", "business", "advertiser", "admin"],
  activeRole: "viewer",
  country: "GB",
  language: "English",
  avatarGradient: ["#5B8DEF", "#243F80"],
  avatarUrl: "/images/avatars/usr_viewer.svg",
  emailVerified: true,
  mobileVerified: true,
  mfaEnabled: true,
  createdAt: daysAgo(1_260),
  status: "active",
  channelId: "ch_mara",
  activeProfileId: "prof_main",
  profiles: [
    {
      id: "prof_main",
      name: "Mara",
      kind: "adult",
      avatarGradient: ["#5B8DEF", "#243F80"],
      avatarUrl: "/images/avatars/prof_main.svg",
      maxAgeRating: "18",
      language: "English",
    },
    {
      id: "prof_partner",
      name: "Jonah",
      kind: "adult",
      avatarGradient: ["#38A8E0", "#175E85"],
      avatarUrl: "/images/avatars/prof_partner.svg",
      maxAgeRating: "18",
      language: "English",
    },
    {
      id: "prof_teen",
      name: "Immy",
      kind: "teen",
      avatarGradient: ["#9B7BF0", "#5B3BB0"],
      avatarUrl: "/images/avatars/prof_teen.svg",
      maxAgeRating: "12",
      language: "English",
    },
    {
      id: "prof_kids",
      name: "Kids",
      kind: "child",
      avatarGradient: ["#34C77B", "#12694A"],
      avatarUrl: "/images/avatars/prof_kids.svg",
      maxAgeRating: "U",
      language: "English",
    },
  ],
  notificationPreferences: {
    "new-upload": on,
    "live-starting": on,
    reply: inAppOnly,
    mention: inAppOnly,
    "purchase-receipt": emailOnly,
    "rental-expiring": on,
    payout: emailOnly,
    policy: emailOnly,
  },
  parentalControls: {
    enabled: true,
    maxAgeRating: "12",
    pin: "••••",
  },
  privacy: {
    watchHistoryVisible: false,
    watchlistPublic: false,
    personalisedRecommendations: true,
    personalisedAds: false,
  },
};

export const watchlist: string[] = [
  "vid_saltmarsh",
  "vid_ledger_water",
  "vid_orbit_session_14",
  "vid_meridian_stats",
  "vid_verge_azores",
  "vid_paperkingdom",
];

export const watchProgress: WatchProgress[] = [
  {
    videoId: "vid_ledger_water",
    positionSeconds: 1_640,
    durationSeconds: 3_960,
    updatedAt: hoursAgo(6),
    completed: false,
  },
  {
    videoId: "vid_helio_aurora",
    positionSeconds: 412,
    durationSeconds: 1_452,
    updatedAt: hoursAgo(28),
    completed: false,
  },
  {
    videoId: "vid_meridian_stats",
    positionSeconds: 2_980,
    durationSeconds: 3_180,
    updatedAt: daysAgo(3),
    completed: false,
  },
  {
    videoId: "vid_orbit_session_13",
    positionSeconds: 2_412,
    durationSeconds: 2_412,
    updatedAt: daysAgo(9),
    completed: true,
  },
  {
    videoId: "vid_saltmarsh",
    positionSeconds: 3_120,
    durationSeconds: 6_840,
    updatedAt: daysAgo(1),
    completed: false,
  },
  {
    videoId: "vid_asha_workbench",
    positionSeconds: 890,
    durationSeconds: 2_190,
    updatedAt: daysAgo(4),
    completed: false,
  },
  {
    videoId: "vid_ledger_bulletin",
    positionSeconds: 726,
    durationSeconds: 726,
    updatedAt: hoursAgo(14),
    completed: true,
  },
  {
    videoId: "vid_tideline_appeal",
    positionSeconds: 522,
    durationSeconds: 522,
    updatedAt: daysAgo(10),
    completed: true,
  },
];

export const purchases: PurchaseRecord[] = [
  {
    id: "pur_1041",
    videoId: "vid_saltmarsh",
    kind: "rent",
    price: { amount: 449, currency: "AUD" },
    purchasedAt: daysAgo(1),
    expiresAt: daysAhead(1),
    status: "active",
    invoiceNumber: "NX-2026-041882",
    },
  {
    id: "pur_1038",
    videoId: "vid_riverkeeper",
    kind: "buy",
    price: { amount: 799, currency: "AUD" },
    purchasedAt: daysAgo(64),
    expiresAt: null,
    status: "completed",
    invoiceNumber: "NX-2026-038104",
  },
  {
    id: "pur_1030",
    videoId: "vid_mara_colour",
    kind: "ppv",
    price: { amount: 599, currency: "AUD" },
    purchasedAt: daysAgo(58),
    expiresAt: null,
    status: "completed",
    invoiceNumber: "NX-2026-036617",
  },
  {
    id: "pur_1022",
    videoId: "vid_meridian_safeguarding",
    kind: "buy",
    price: { amount: 4_900, currency: "AUD" },
    purchasedAt: daysAgo(140),
    expiresAt: null,
    status: "completed",
    invoiceNumber: "NX-2026-029003",
  },
  {
    id: "pur_1015",
    videoId: "vid_paperkingdom",
    kind: "rent",
    price: { amount: 399, currency: "AUD" },
    purchasedAt: daysAgo(96),
    expiresAt: daysAgo(94),
    status: "expired",
    invoiceNumber: "NX-2026-024550",
  },
  {
    id: "pur_1009",
    videoId: "vid_lowtide",
    kind: "rent",
    price: { amount: 299, currency: "AUD" },
    purchasedAt: daysAgo(180),
    expiresAt: daysAgo(178),
    status: "refunded",
    invoiceNumber: "NX-2026-019441",
  },
];

export const subscriptions: Subscription[] = [
  {
    id: "sub_platform",
    name: "Nexus Premium",
    kind: "platform",
    price: { amount: 999, currency: "AUD" },
    interval: "monthly",
    status: "active",
    renewsAt: daysAhead(12),
    startedAt: daysAgo(410),
    benefits: [
      "Ad-free viewing across the platform",
      "Included films and series from participating studios",
      "Offline downloads on mobile",
      "Up to five viewer profiles",
    ],
  },
  {
    id: "sub_ledger",
    name: "The Ledger — Supporter",
    kind: "channel-membership",
    channelId: "ch_ledger",
    price: { amount: 500, currency: "AUD" },
    interval: "monthly",
    status: "active",
    renewsAt: daysAhead(19),
    startedAt: daysAgo(220),
    benefits: [
      "Full investigation source packs",
      "Members-only newsroom briefings",
      "Early access to long-form investigations",
    ],
  },
  {
    id: "sub_orbit",
    name: "Orbit Sessions — Extended cuts",
    kind: "channel-membership",
    channelId: "ch_orbit",
    price: { amount: 400, currency: "AUD" },
    interval: "monthly",
    status: "past-due",
    renewsAt: daysAgo(2),
    startedAt: daysAgo(300),
    benefits: ["Extended session cuts", "Subscriber-only live streams"],
  },
  {
    id: "sub_meridian",
    name: "Meridian University — Learner",
    kind: "channel-membership",
    channelId: "ch_meridian",
    price: { amount: 2_400, currency: "AUD" },
    interval: "annual",
    status: "cancelled",
    renewsAt: daysAgo(30),
    startedAt: daysAgo(400),
    benefits: ["Accredited course tracks", "Assessed exercises and certificates"],
  },
];

export const notifications: AppNotification[] = [
  {
    id: "ntf_01",
    event: "rental-expiring",
    title: "Your rental of The Saltmarsh expires in 24 hours",
    body: "Finish watching before the rental window closes, or buy it outright to keep access.",
    createdAt: hoursAgo(2),
    read: false,
    href: "/video/vid_saltmarsh",
  },
  {
    id: "ntf_02",
    event: "live-starting",
    title: "Planning committee is live now",
    body: "Harborough City Council started streaming an hour ago.",
    createdAt: hoursAgo(1),
    read: false,
    href: "/live/live_council_planning",
  },
  {
    id: "ntf_03",
    event: "new-upload",
    title: "The Ledger published a new investigation",
    body: "Who owns the water — a fourteen-month investigation.",
    createdAt: daysAgo(21),
    read: true,
    href: "/video/vid_ledger_water",
  },
  {
    id: "ntf_04",
    event: "policy",
    title: "A video is pending review",
    body: "Building a documentary rig (sponsored) was submitted for review because of the sponsorship disclosure requirement.",
    createdAt: daysAgo(2),
    read: false,
    href: "/studio/content",
  },
  {
    id: "ntf_05",
    event: "payout",
    title: "August payout scheduled",
    body: "$4,182.60 is scheduled for payout on the 28th.",
    createdAt: daysAgo(4),
    read: true,
    href: "/studio/revenue",
  },
  {
    id: "ntf_06",
    event: "reply",
    title: "Devon Pryce replied to your comment",
    body: "“The side-by-side at 14:20 is the most honest lens comparison…”",
    createdAt: hoursAgo(30),
    read: true,
    href: "/video/vid_mara_anamorphic",
  },
  {
    id: "ntf_07",
    event: "purchase-receipt",
    title: "Receipt: Nexus Premium",
    body: "Invoice NX-2026-041882 — $9.99",
    createdAt: daysAgo(1),
    read: true,
    href: "/account/billing",
  },
];

/** Which channels the mock user follows — drives the "From your channels" rail. */
export const following: string[] = [
  "ch_ledger",
  "ch_orbit",
  "ch_northlight",
  "ch_meridian",
  "ch_tideline",
];
