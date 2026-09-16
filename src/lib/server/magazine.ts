// Server-only. The Nexus-side half of the "MYHitch Lens magazine" feature — see
// docs/DEVELOPMENT-PLAN.md's Lens research entry for why this is built inside Nexus
// rather than inside Lens itself (Lens's own build status/API readiness is unknown, and
// the signed requirements document commits it to nothing beyond "embed or cross-publish").
// Lens becomes a consumer of getPublishedArticles()/getPublishedArticleBySlug() via a
// small future read API, not a reason to wait.
//
// The video link is optional, not required — see migration 20260916000003's header for
// why: requiring a real `videos` row the author owns would make this feature unusable by
// any real account today, since real video publishing is still 100% mock (P2/Mux-blocked).
// `aboutTitle` (the name of the work being discussed) always exists regardless of whether
// a real catalogue video exists to link to it.
//
// Deliberately excludes: real-time collaborative editing (not needed for single-author
// long-form writing — see the research), plagiarism screening (a vendor-integration
// decision for later, not blocking a first version), and a "Corrected" post-publish state
// (an edit while published just updates the row in place for now).
import "server-only";
import { query, queryOne } from "./db";

const SLUG_PATTERN = /[^a-z0-9]+/g;

function slugify(title: string): string {
  const base = title.toLowerCase().replace(SLUG_PATTERN, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "article";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export type MagazineStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "published"
  | "rejected"
  | "withdrawn";

export interface MagazineArticle {
  id: string;
  slug: string;
  aboutTitle: string;
  videoId: string | null;
  videoTitle: string | null;
  videoSlug: string | null;
  channelId: string | null;
  channelName: string | null;
  authorAccountId: string;
  authorName: string;
  title: string;
  dek: string | null;
  bodyHtml: string;
  isFilmmakerAnalysis: boolean;
  status: MagazineStatus;
  reviewerNotes: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ArticleRow {
  id: string;
  slug: string;
  about_title: string;
  video_id: string | null;
  video_title: string | null;
  video_slug: string | null;
  channel_id: string | null;
  channel_name: string | null;
  author_account_id: string;
  author_name: string;
  title: string;
  dek: string | null;
  body_html: string;
  is_filmmaker_analysis: boolean;
  status: MagazineStatus;
  reviewer_notes: string | null;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const ARTICLE_COLUMNS = `
  m.id, m.slug, m.about_title, m.video_id, v.title as video_title, v.slug as video_slug,
  v.channel_id, o.name as channel_name,
  m.author_account_id, a.full_name as author_name,
  m.title, m.dek, m.body_html, m.is_filmmaker_analysis, m.status,
  m.reviewer_notes, m.submitted_at, m.published_at, m.created_at, m.updated_at
`;
// Left joins: a linked video (and therefore its channel) are optional — see this file's
// header for why a real videos row can't be required.
const ARTICLE_JOINS = `
  left join videos v on v.id = m.video_id
  left join organizations o on o.id = v.channel_id
  join accounts a on a.id = m.author_account_id
`;

function mapArticle(row: ArticleRow): MagazineArticle {
  return {
    id: row.id,
    slug: row.slug,
    aboutTitle: row.about_title,
    videoId: row.video_id,
    videoTitle: row.video_title,
    videoSlug: row.video_slug,
    channelId: row.channel_id,
    channelName: row.channel_name,
    authorAccountId: row.author_account_id,
    authorName: row.author_name,
    title: row.title,
    dek: row.dek,
    bodyHtml: row.body_html,
    isFilmmakerAnalysis: row.is_filmmaker_analysis,
    status: row.status,
    reviewerNotes: row.reviewer_notes,
    submittedAt: row.submitted_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Whether `accountId` owns (via channel membership) the channel that published
 * `videoId` — the gate for optionally linking a real catalogue video to an article. */
export async function ownsVideo(accountId: string, videoId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select v.id
     from videos v
     join memberships m on m.organization_id = v.channel_id
     where v.id = $1 and m.account_id = $2`,
    [videoId, accountId],
  );
  return Boolean(row);
}

export async function createArticle(
  accountId: string,
  input: { aboutTitle: string; videoId: string | null; title: string; dek: string | null },
): Promise<MagazineArticle> {
  const rows = await query<{ id: string }>(
    `insert into magazine_articles (slug, about_title, video_id, author_account_id, title, dek)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      slugify(input.title),
      input.aboutTitle.trim().slice(0, 200),
      input.videoId,
      accountId,
      input.title.trim().slice(0, 200),
      input.dek?.trim().slice(0, 300) ?? null,
    ],
  );
  const article = await getArticleById(rows[0].id);
  if (!article) throw new Error("Failed to load article immediately after creating it.");
  return article;
}

export async function getArticleById(id: string): Promise<MagazineArticle | null> {
  const row = await queryOne<ArticleRow>(
    `select ${ARTICLE_COLUMNS} from magazine_articles m ${ARTICLE_JOINS} where m.id = $1`,
    [id],
  );
  return row ? mapArticle(row) : null;
}

export async function getMyArticles(accountId: string): Promise<MagazineArticle[]> {
  const rows = await query<ArticleRow>(
    `select ${ARTICLE_COLUMNS} from magazine_articles m ${ARTICLE_JOINS}
     where m.author_account_id = $1
     order by m.updated_at desc`,
    [accountId],
  );
  return rows.map(mapArticle);
}

export type UpdateArticleResult =
  | { outcome: "success"; article: MagazineArticle }
  | { outcome: "not_found" }
  | { outcome: "not_editable" };

const EDITABLE_STATUSES: MagazineStatus[] = ["draft", "changes_requested"];

/** Only the author, and only while the piece hasn't been submitted (or has been sent
 * back for changes), can edit the working draft — once it's in the review queue or
 * published, further edits go through submit/withdraw rather than silent mutation. */
export async function updateDraftArticle(
  id: string,
  accountId: string,
  patch: { title?: string; dek?: string | null; bodyHtml?: string; aboutTitle?: string },
): Promise<UpdateArticleResult> {
  const existing = await queryOne<{ status: MagazineStatus }>(
    `select status from magazine_articles where id = $1 and author_account_id = $2`,
    [id, accountId],
  );
  if (!existing) return { outcome: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { outcome: "not_editable" };

  const columns: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    columns.push(`${column} = $${values.length}`);
  };
  if (patch.title !== undefined) set("title", patch.title.trim().slice(0, 200));
  if (patch.dek !== undefined) set("dek", patch.dek?.trim().slice(0, 300) ?? null);
  if (patch.bodyHtml !== undefined) set("body_html", patch.bodyHtml);
  if (patch.aboutTitle !== undefined) set("about_title", patch.aboutTitle.trim().slice(0, 200));

  if (columns.length > 0) {
    values.push(id);
    await query(`update magazine_articles set ${columns.join(", ")} where id = $${values.length}`, values);
  }

  const article = await getArticleById(id);
  return article ? { outcome: "success", article } : { outcome: "not_found" };
}

export type TransitionResult =
  | { outcome: "success"; article: MagazineArticle }
  | { outcome: "not_found" }
  | { outcome: "invalid_transition" };

/** Draft/changes-requested -> submitted. Requires a non-empty body — an empty pitch
 * shouldn't be able to occupy a reviewer's queue slot. */
export async function submitArticle(id: string, accountId: string): Promise<TransitionResult> {
  const existing = await queryOne<{ status: MagazineStatus; body_html: string }>(
    `select status, body_html from magazine_articles where id = $1 and author_account_id = $2`,
    [id, accountId],
  );
  if (!existing) return { outcome: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { outcome: "invalid_transition" };
  if (existing.body_html.replace(/<[^>]+>/g, "").trim().length < 50) {
    return { outcome: "invalid_transition" };
  }

  await query(
    `update magazine_articles set status = 'submitted', submitted_at = now(), reviewer_notes = null where id = $1`,
    [id],
  );
  const article = await getArticleById(id);
  return article ? { outcome: "success", article } : { outcome: "not_found" };
}

/** Author-initiated withdrawal — allowed any time before publication so a creator can
 * pull a piece they've had second thoughts about without waiting on a reviewer. */
export async function withdrawArticle(id: string, accountId: string): Promise<TransitionResult> {
  const existing = await queryOne<{ status: MagazineStatus }>(
    `select status from magazine_articles where id = $1 and author_account_id = $2`,
    [id, accountId],
  );
  if (!existing) return { outcome: "not_found" };
  if (existing.status === "published" || existing.status === "withdrawn") {
    return { outcome: "invalid_transition" };
  }
  await query(`update magazine_articles set status = 'withdrawn' where id = $1`, [id]);
  const article = await getArticleById(id);
  return article ? { outcome: "success", article } : { outcome: "not_found" };
}

/** The editorial queue — every real system studied (Editorial Manager, OJS, Medium's
 * publication model) puts a human decision between "submitted" and "public"; this is
 * that gate. No dedicated admin role split yet (moderator/finance/super is P4 scope per
 * the dev plan) — any admin can review. */
export async function getPendingReview(): Promise<MagazineArticle[]> {
  const rows = await query<ArticleRow>(
    `select ${ARTICLE_COLUMNS} from magazine_articles m ${ARTICLE_JOINS}
     where m.status = 'submitted'
     order by m.submitted_at asc`,
  );
  return rows.map(mapArticle);
}

export type ReviewDecision = "publish" | "request_changes" | "reject";

export async function reviewArticle(
  id: string,
  reviewerAccountId: string,
  decision: ReviewDecision,
  notes: string | null,
): Promise<TransitionResult> {
  const existing = await queryOne<{ status: MagazineStatus }>(
    `select status from magazine_articles where id = $1`,
    [id],
  );
  if (!existing) return { outcome: "not_found" };
  if (existing.status !== "submitted") return { outcome: "invalid_transition" };

  const nextStatus: MagazineStatus =
    decision === "publish" ? "published" : decision === "reject" ? "rejected" : "changes_requested";

  await query(
    `update magazine_articles
     set status = $1, reviewer_notes = $2, reviewed_by = $3,
         published_at = case when $1 = 'published' then now() else published_at end
     where id = $4`,
    [nextStatus, notes, reviewerAccountId, id],
  );
  const article = await getArticleById(id);
  return article ? { outcome: "success", article } : { outcome: "not_found" };
}

export async function getPublishedArticles(limit = 24): Promise<MagazineArticle[]> {
  const rows = await query<ArticleRow>(
    `select ${ARTICLE_COLUMNS} from magazine_articles m ${ARTICLE_JOINS}
     where m.status = 'published'
     order by m.published_at desc
     limit $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map(mapArticle);
}

export async function getPublishedArticleBySlug(slug: string): Promise<MagazineArticle | null> {
  const row = await queryOne<ArticleRow>(
    `select ${ARTICLE_COLUMNS} from magazine_articles m ${ARTICLE_JOINS}
     where m.slug = $1 and m.status = 'published'`,
    [slug],
  );
  return row ? mapArticle(row) : null;
}

export async function getArticlesForVideo(videoId: string): Promise<MagazineArticle[]> {
  const rows = await query<ArticleRow>(
    `select ${ARTICLE_COLUMNS} from magazine_articles m ${ARTICLE_JOINS}
     where m.video_id = $1 and m.status = 'published'
     order by m.published_at desc`,
    [videoId],
  );
  return rows.map(mapArticle);
}
