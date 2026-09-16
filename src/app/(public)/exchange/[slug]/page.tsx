import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@/components/ui/badge";
import { getPublishedListingBySlug } from "@/lib/server/sponsorship";
import { SPONSORSHIP_REWARD_LABELS } from "@/lib/mock-api/types";
import { absoluteUrl, formatDate } from "@/lib/utils";
import { ExpressInterestForm } from "../express-interest-form";

// Wrapped in cache() so generateMetadata and the page body share one query per request,
// same pattern as magazine/[slug]'s resolveArticle.
const resolveListing = cache(async (slug: string) => getPublishedListingBySlug(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await resolveListing(slug);
  if (!listing) return { title: "Listing not found" };

  const description = `${listing.authorName} is seeking sponsorship for ${listing.projectName}.`;
  return {
    title: listing.projectName,
    description,
    openGraph: { title: listing.projectName, description, type: "article" },
    twitter: { card: "summary", title: listing.projectName, description },
  };
}

export default async function ExchangeListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await resolveListing(slug);
  if (!listing) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: listing.projectName,
    description: `${listing.authorName} is seeking sponsorship for ${listing.projectName}.`,
    author: { "@type": "Person", name: listing.authorName },
    datePublished: listing.publishedAt ?? undefined,
    dateModified: listing.updatedAt,
    mainEntityOfPage: absoluteUrl(`/exchange/${listing.slug}`),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link href="/exchange" className="text-xs text-fg-muted transition-colors hover:text-accent">
        ← Exchange Hub
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="accent" size="sm">
          Sponsorship pitch
        </Badge>
        {listing.publishedAt ? (
          <span className="text-2xs text-fg-subtle nx-tnum">{formatDate(listing.publishedAt, "long")}</span>
        ) : null}
      </div>

      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-fg sm:text-4xl">
        {listing.projectName}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        By {listing.authorName} · {listing.channelName}
      </p>

      <p className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
        This is a sponsorship pitch written by {listing.authorName}, the creator of {listing.projectName}. Any
        reward offered is exposure or recognition only — never a share of profits, revenue, or ownership.
      </p>

      {listing.videoId ? (
        <Link
          href={`/video/${listing.videoId}`}
          className="mt-5 block rounded-lg border border-border bg-surface p-4 text-sm text-fg transition-colors hover:border-border-strong"
        >
          Watch {listing.videoTitle ?? "the trailer"} →
        </Link>
      ) : null}

      <div
        className="nx-article-body mt-6"
        dangerouslySetInnerHTML={{ __html: listing.pitchHtml }}
      />

      {listing.rewardTypes.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">What a sponsor gets</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {listing.rewardTypes.map((reward) => (
              <Badge key={reward} tone="neutral" size="sm">
                {SPONSORSHIP_REWARD_LABELS[reward]}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <ExpressInterestForm listingId={listing.id} />
      </div>
    </div>
  );
}
