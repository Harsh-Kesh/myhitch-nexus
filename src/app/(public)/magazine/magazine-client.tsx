"use client";

import { IconNews } from "@tabler/icons-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePublishedMagazine } from "@/lib/mock-api/hooks";
import { formatDate } from "@/lib/utils";

export function MagazineIndexClient() {
  const { data: articles = [], isLoading } = usePublishedMagazine();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">Magazine</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
        Filmmakers and creators writing about their own work — the story behind a film,
        alongside its trailer. Every piece here is the maker&rsquo;s own perspective, not
        independent criticism.
      </p>

      <div className="mt-8 space-y-6">
        {isLoading ? null : articles.length === 0 ? (
          <EmptyState
            icon={<IconNews />}
            title="Nothing published yet"
            description="Creators can submit an analysis of their own work from Creator Studio."
          />
        ) : (
          articles.map((article) => (
            <Link
              key={article.id}
              href={`/magazine/${article.slug}`}
              className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent" size="sm">
                  Filmmaker&rsquo;s analysis
                </Badge>
                <span className="text-2xs text-fg-subtle nx-tnum">
                  {article.publishedAt ? formatDate(article.publishedAt, "long") : ""}
                </span>
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold text-fg">{article.title}</h2>
              <p className="mt-1 text-sm text-fg-muted">About {article.aboutTitle}</p>
              {article.dek ? (
                <p className="mt-2 nx-clamp-2 text-sm leading-relaxed text-fg-muted">{article.dek}</p>
              ) : null}
              <p className="mt-3 text-xs text-fg-subtle">
                By {article.authorName} · {article.channelName ?? "MYHitch Nexus"}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
