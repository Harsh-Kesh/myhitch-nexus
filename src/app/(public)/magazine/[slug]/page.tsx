import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@/components/ui/badge";
import { getPublishedArticleBySlug } from "@/lib/server/magazine";
import { absoluteUrl, formatDate } from "@/lib/utils";

// Wrapped in cache() so generateMetadata and the page body share one query per request,
// same pattern as video/[id]'s resolveVideoMeta.
const resolveArticle = cache(async (slug: string) => getPublishedArticleBySlug(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await resolveArticle(slug);
  if (!article) return { title: "Article not found" };

  const description = article.dek || `${article.authorName}'s analysis of ${article.aboutTitle}.`;
  return {
    title: article.title,
    description,
    openGraph: { title: article.title, description, type: "article" },
    twitter: { card: "summary", title: article.title, description },
  };
}

export default async function MagazineArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await resolveArticle(slug);
  if (!article) notFound();

  // Structured data marks this explicitly as the filmmaker's own perspective on their
  // own work — schema.org has no dedicated "director's statement" type, so Review
  // (author reviewing itemReviewed) is the closest fit, with the disclosure carried in
  // the visible page copy too, not just markup a crawler might not surface to readers.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.dek || undefined,
    author: { "@type": "Person", name: article.authorName },
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt,
    about: article.aboutTitle,
    mainEntityOfPage: absoluteUrl(`/magazine/${article.slug}`),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link href="/magazine" className="text-xs text-fg-muted transition-colors hover:text-accent">
        ← Magazine
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="accent" size="sm">
          Filmmaker&rsquo;s analysis
        </Badge>
        {article.publishedAt ? (
          <span className="text-2xs text-fg-subtle nx-tnum">{formatDate(article.publishedAt, "long")}</span>
        ) : null}
      </div>

      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-fg sm:text-4xl">
        {article.title}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        By {article.authorName} · about{" "}
        {article.videoId ? (
          <Link href={`/video/${article.videoId}`} className="text-fg underline-offset-2 hover:underline">
            {article.aboutTitle}
          </Link>
        ) : (
          article.aboutTitle
        )}
      </p>

      <p className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
        This piece is written by {article.authorName}, the creator of {article.aboutTitle} — it is their own
        perspective on their own work, not independent criticism.
      </p>

      {article.dek ? (
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">{article.dek}</p>
      ) : null}

      <div
        className="nx-article-body mt-6"
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />
    </div>
  );
}
