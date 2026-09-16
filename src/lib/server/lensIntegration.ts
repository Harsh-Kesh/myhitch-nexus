// Server-only. The Nexus -> Lens submission call — see magazine.ts's header and
// docs/DEVELOPMENT-PLAN.md's 2026-09-16 correction entry for why this exists: Lens is a
// separate, already-real article-writing platform (actively being built), and it owns
// public hosting and editorial review, not Nexus.
//
// Deliberately fails open, same pattern as localPassword.ts's Redis-backed rate limiter
// and the Sentry entry's "no SENTRY_AUTH_TOKEN configured, skipped for now": a missing
// LENS_API_URL/LENS_API_KEY, or Lens being unreachable, must never undo a submit that
// already succeeded on Nexus's own side — the article is genuinely "done" from Nexus's
// perspective the moment its author submits it, regardless of whether Lens can be reached
// this second. A failure here just means the submission sits in `submitted` without a
// `lens_submission_id` until it's retried or Lens's endpoint exists.
//
// Proposed contract (Lens is still being built, so this is a starting point, not fixed):
//   POST {LENS_API_URL}/nexus-submissions
//   Authorization: Bearer {LENS_API_KEY}
//   Content-Type: application/json
//   body: { nexusArticleId, title, dek, bodyHtml, aboutTitle, videoUrl, authorName,
//           channelName, submittedAt }
//   expected 200 response: { lensSubmissionId: string }
//
// Lens reports its decision back later via POST /api/integrations/lens/status on Nexus
// (same bearer-token auth) — see that route's own header for its payload shape.
import "server-only";
import type { MagazineArticle } from "./magazine";
import { absoluteUrl } from "../utils";

export async function submitArticleToLens(article: MagazineArticle): Promise<string | null> {
  const baseUrl = process.env.LENS_API_URL;
  const apiKey = process.env.LENS_API_KEY;
  if (!baseUrl || !apiKey) {
    console.log(`Lens integration not configured — article ${article.id} stays queued in "submitted".`);
    return null;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/nexus-submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        nexusArticleId: article.id,
        title: article.title,
        dek: article.dek,
        bodyHtml: article.bodyHtml,
        aboutTitle: article.aboutTitle,
        videoUrl: article.videoId ? absoluteUrl(`/video/${article.videoId}`) : null,
        authorName: article.authorName,
        channelName: article.channelName,
        submittedAt: article.submittedAt,
      }),
    });

    if (!response.ok) {
      console.error(`Lens submission for article ${article.id} failed with ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { lensSubmissionId?: string };
    return data.lensSubmissionId ?? null;
  } catch (err) {
    console.error(`Lens submission for article ${article.id} failed`, err);
    return null;
  }
}
