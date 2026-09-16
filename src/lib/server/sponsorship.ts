// Server-only. The Nexus-side authoring half of the "Exchange Hub" sponsorship pitch —
// see docs/DEVELOPMENT-PLAN.md's 2026-09-16 correction entry. Exchange Hub itself lives
// on MYHitch Connect, a separate in-house platform — Nexus's job is only to let a
// creator compose the pitch (project name, trailer link, full pitch, and the reward
// they're offering) and mark it "submitted". There is deliberately no admin review queue
// and no public page on Nexus: Connect owns hosting, browsing and sponsor inquiries.
//
// Connect isn't running yet and isn't currently being built, so there is no live
// integration call here (unlike magazine.ts's submitArticleToLens) — "submitted" is
// simply the honest terminal state a listing reaches today. The moment Connect's
// submission contract exists, the same fire-and-forget pattern used for Lens can be
// dropped into submitListing() below.
//
// The reward vocabulary is still a closed, check-constrained, non-financial set with no
// free-text monetary field anywhere in the schema — see the migration's own header for
// the Australian securities-law reasoning. That constraint is exactly the shape of data
// Connect will need, regardless of when the handoff itself goes live.
import "server-only";
import { query, queryOne } from "./db";

const SLUG_PATTERN = /[^a-z0-9]+/g;

function slugify(name: string): string {
  const base = name.toLowerCase().replace(SLUG_PATTERN, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "listing";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export type ListingStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "published"
  | "rejected"
  | "withdrawn"
  | "closed";

export const REWARD_TYPES = [
  "screen_credit",
  "logo_placement",
  "product_placement",
  "premiere_tickets",
  "social_mention",
  "official_sponsor_badge",
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export interface SponsorshipListing {
  id: string;
  slug: string;
  channelId: string;
  channelName: string;
  channelAvatarGradient: [string, string];
  createdByAccountId: string;
  authorName: string;
  videoId: string | null;
  videoTitle: string | null;
  projectName: string;
  pitchHtml: string;
  rewardTypes: RewardType[];
  status: ListingStatus;
  reviewerNotes: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListingRow {
  id: string;
  slug: string;
  channel_id: string;
  channel_name: string;
  channel_avatar_gradient: [string, string];
  created_by_account_id: string;
  author_name: string;
  video_id: string | null;
  video_title: string | null;
  project_name: string;
  pitch_html: string;
  reward_types: RewardType[] | null;
  status: ListingStatus;
  reviewer_notes: string | null;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// reward_types comes back as a Postgres array via array_agg — coalesced to '{}' so a
// listing with no rewards chosen yet maps to an empty array, not [null].
const LISTING_COLUMNS = `
  s.id, s.slug, s.channel_id, o.name as channel_name, o.avatar_gradient as channel_avatar_gradient,
  s.created_by_account_id, a.full_name as author_name,
  s.video_id, v.title as video_title,
  s.project_name, s.pitch_html, s.status,
  s.reviewer_notes, s.submitted_at, s.published_at, s.created_at, s.updated_at,
  coalesce(
    (select array_agg(r.reward_type order by r.reward_type) from sponsorship_rewards r where r.listing_id = s.id),
    '{}'
  ) as reward_types
`;
const LISTING_JOINS = `
  join organizations o on o.id = s.channel_id
  join accounts a on a.id = s.created_by_account_id
  left join videos v on v.id = s.video_id
`;

function mapListing(row: ListingRow): SponsorshipListing {
  return {
    id: row.id,
    slug: row.slug,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelAvatarGradient: row.channel_avatar_gradient,
    createdByAccountId: row.created_by_account_id,
    authorName: row.author_name,
    videoId: row.video_id,
    videoTitle: row.video_title,
    projectName: row.project_name,
    pitchHtml: row.pitch_html,
    rewardTypes: row.reward_types ?? [],
    status: row.status,
    reviewerNotes: row.reviewer_notes,
    submittedAt: row.submitted_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Same bar as channelSettings.ts's isChannelMember — every registered creator/business/
 * etc. account gets a real channel at signup (channelProvisioning.ts), so requiring one
 * here, unlike the video link, is safe rather than a repeat of Magazine's original
 * video_id mistake. */
async function isChannelMember(accountId: string, channelId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, channelId],
  );
  return Boolean(row);
}

async function ownsVideo(accountId: string, videoId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select v.id from videos v join memberships m on m.organization_id = v.channel_id
     where v.id = $1 and m.account_id = $2`,
    [videoId, accountId],
  );
  return Boolean(row);
}

async function setRewards(listingId: string, rewardTypes: RewardType[]): Promise<void> {
  await query(`delete from sponsorship_rewards where listing_id = $1`, [listingId]);
  for (const rewardType of rewardTypes) {
    await query(
      `insert into sponsorship_rewards (listing_id, reward_type) values ($1, $2) on conflict do nothing`,
      [listingId, rewardType],
    );
  }
}

export type CreateListingResult =
  | { outcome: "success"; listing: SponsorshipListing }
  | { outcome: "not_channel_member" }
  | { outcome: "not_video_owner" };

export async function createListing(
  accountId: string,
  input: { channelId: string; videoId: string | null; projectName: string },
): Promise<CreateListingResult> {
  if (!(await isChannelMember(accountId, input.channelId))) {
    return { outcome: "not_channel_member" };
  }
  if (input.videoId && !(await ownsVideo(accountId, input.videoId))) {
    return { outcome: "not_video_owner" };
  }

  const rows = await query<{ id: string }>(
    `insert into sponsorship_listings (slug, channel_id, created_by_account_id, video_id, project_name)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [slugify(input.projectName), input.channelId, accountId, input.videoId, input.projectName.trim().slice(0, 200)],
  );
  const listing = await getListingById(rows[0].id);
  if (!listing) throw new Error("Failed to load listing immediately after creating it.");
  return { outcome: "success", listing };
}

export async function getListingById(id: string): Promise<SponsorshipListing | null> {
  const row = await queryOne<ListingRow>(
    `select ${LISTING_COLUMNS} from sponsorship_listings s ${LISTING_JOINS} where s.id = $1`,
    [id],
  );
  return row ? mapListing(row) : null;
}

/** Every listing on channels `accountId` is a member of — matches the "one listing per
 * project, any member of the channel can manage it" shape the rest of Studio already
 * uses (e.g. playlists), rather than only the original creator being able to touch it. */
export async function getMyListings(accountId: string): Promise<SponsorshipListing[]> {
  const rows = await query<ListingRow>(
    `select ${LISTING_COLUMNS} from sponsorship_listings s ${LISTING_JOINS}
     where s.channel_id in (select organization_id from memberships where account_id = $1)
     order by s.updated_at desc`,
    [accountId],
  );
  return rows.map(mapListing);
}

const EDITABLE_STATUSES: ListingStatus[] = ["draft", "changes_requested"];

export type UpdateListingResult =
  | { outcome: "success"; listing: SponsorshipListing }
  | { outcome: "not_found" }
  | { outcome: "not_editable" }
  | { outcome: "not_video_owner" };

export async function updateDraftListing(
  id: string,
  accountId: string,
  patch: { projectName?: string; pitchHtml?: string; videoId?: string | null; rewardTypes?: RewardType[] },
): Promise<UpdateListingResult> {
  const existing = await queryOne<{ status: ListingStatus; channel_id: string }>(
    `select status, channel_id from sponsorship_listings where id = $1
     and channel_id in (select organization_id from memberships where account_id = $2)`,
    [id, accountId],
  );
  if (!existing) return { outcome: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { outcome: "not_editable" };
  if (patch.videoId && !(await ownsVideo(accountId, patch.videoId))) {
    return { outcome: "not_video_owner" };
  }

  const columns: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    columns.push(`${column} = $${values.length}`);
  };
  if (patch.projectName !== undefined) set("project_name", patch.projectName.trim().slice(0, 200));
  if (patch.pitchHtml !== undefined) set("pitch_html", patch.pitchHtml);
  if (patch.videoId !== undefined) set("video_id", patch.videoId);

  if (columns.length > 0) {
    values.push(id);
    await query(`update sponsorship_listings set ${columns.join(", ")} where id = $${values.length}`, values);
  }
  if (patch.rewardTypes !== undefined) {
    await setRewards(id, patch.rewardTypes);
  }

  const listing = await getListingById(id);
  return listing ? { outcome: "success", listing } : { outcome: "not_found" };
}

export type TransitionResult =
  | { outcome: "success"; listing: SponsorshipListing }
  | { outcome: "not_found" }
  | { outcome: "invalid_transition" };

/** Draft/changes-requested -> submitted. Requires a real pitch and at least one
 * (non-financial) reward selected — an empty ask, or one offering nothing back, isn't a
 * real sponsorship pitch. No admin gate on Nexus's side — "submitted" is the honest
 * terminal state until MYHitch Connect's submission contract exists (see this file's
 * header); nothing calls out anywhere yet. */
export async function submitListing(id: string, accountId: string): Promise<TransitionResult> {
  const existing = await queryOne<{ status: ListingStatus; pitch_html: string }>(
    `select status, pitch_html from sponsorship_listings where id = $1
     and channel_id in (select organization_id from memberships where account_id = $2)`,
    [id, accountId],
  );
  if (!existing) return { outcome: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { outcome: "invalid_transition" };
  if (existing.pitch_html.replace(/<[^>]+>/g, "").trim().length < 50) {
    return { outcome: "invalid_transition" };
  }
  const rewardCount = await queryOne<{ count: string }>(
    `select count(*)::text as count from sponsorship_rewards where listing_id = $1`,
    [id],
  );
  if (!rewardCount || Number(rewardCount.count) === 0) {
    return { outcome: "invalid_transition" };
  }

  await query(
    `update sponsorship_listings set status = 'submitted', submitted_at = now(), reviewer_notes = null where id = $1`,
    [id],
  );
  const listing = await getListingById(id);
  return listing ? { outcome: "success", listing } : { outcome: "not_found" };
}

export async function withdrawListing(id: string, accountId: string): Promise<TransitionResult> {
  const existing = await queryOne<{ status: ListingStatus }>(
    `select status from sponsorship_listings where id = $1
     and channel_id in (select organization_id from memberships where account_id = $2)`,
    [id, accountId],
  );
  if (!existing) return { outcome: "not_found" };
  if (existing.status === "withdrawn" || existing.status === "closed") {
    return { outcome: "invalid_transition" };
  }
  await query(`update sponsorship_listings set status = 'withdrawn' where id = $1`, [id]);
  const listing = await getListingById(id);
  return listing ? { outcome: "success", listing } : { outcome: "not_found" };
}
