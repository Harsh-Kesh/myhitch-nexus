"use client";

import Link from "next/link";
import {
  IconBuildingCommunity,
  IconBuildingStore,
  IconCertificate,
  IconChevronRight,
  IconCompass,
  IconDeviceTv,
  IconHeartHandshake,
  IconMicrophone2,
  IconMovie,
  IconMusic,
  IconNews,
  IconPlayerPlay,
  IconRocket,
  IconSchool,
  IconSearch,
  IconVideo,
} from "@tabler/icons-react";
import { BrowseView } from "@/components/discovery/browse-view";
import { CONTENT_TYPE_LABELS } from "@/lib/mock-api/data/categories";
import { useCategories } from "@/lib/mock-api/hooks";
import { compactNumber } from "@/lib/utils";

// Keyed on slug, not id: the real catalogue (supabase/migrations/20260914000003_catalogue.sql)
// generates fresh uuids per category, so the mock's fixed "cat_brand_film"-style ids no
// longer exist anywhere once getCategories() is backed by Postgres (see its comment in
// src/lib/mock-api/index.ts). Slugs are stable across both — seeded directly from this
// same mock data — so they're the correct, durable key for presentation-only lookups
// like this one.
function getCategoryIcon(slug: string) {
  switch (slug) {
    case "brand-films":
      return <IconBuildingStore className="size-4" />;
    case "product-launches":
      return <IconRocket className="size-4" />;
    case "feature-films":
      return <IconMovie className="size-4" />;
    case "short-films":
      return <IconPlayerPlay className="size-4" />;
    case "series":
      return <IconDeviceTv className="size-4" />;
    case "music":
      return <IconMusic className="size-4" />;
    case "courses":
      return <IconSchool className="size-4" />;
    case "skills":
      return <IconCertificate className="size-4" />;
    case "investigations":
      return <IconSearch className="size-4" />;
    case "news-bulletins":
      return <IconNews className="size-4" />;
    case "conferences":
      return <IconMicrophone2 className="size-4" />;
    case "destinations":
      return <IconCompass className="size-4" />;
    case "public-notices":
      return <IconBuildingCommunity className="size-4" />;
    case "impact":
      return <IconHeartHandshake className="size-4" />;
    case "creators":
      return <IconVideo className="size-4" />;
    default:
      return <IconMovie className="size-4" />;
  }
}

export default function ExplorePage() {
  // Real data as of 2026-09-14 (docs/DEVELOPMENT-PLAN.md P1) — getCategories() now reads
  // Postgres via GET /api/categories/ instead of the in-memory mock store. BrowseView
  // below still uses searchVideos(), which is deliberately not yet swapped (see the
  // comment on getCategories() in src/lib/mock-api/index.ts for why).
  const { data: categories, isLoading } = useCategories();

  return (
    <div>
      <section className="border-b border-border px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-fg sm:text-2xl">
              Browse categories
            </h1>
            <p className="mt-1 max-w-xl text-xs text-fg-muted">
              Select any category to explore curated films, commercial productions, series, and live streams.
            </p>
          </div>
          <span className="text-2xs font-medium text-fg-subtle">
            {isLoading ? "Loading…" : `${categories?.length ?? 0} categories available`}
          </span>
        </div>

        {/* Compact, clean & minimal category cards */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {(categories ?? []).map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="group relative flex flex-col justify-between rounded-lg border border-border/80 bg-surface p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface-2 hover:shadow-sm"
            >
              <div>
                {/* Header: Icon + Title count badge */}
                <div className="flex items-center justify-between">
                  <div className="flex size-7 items-center justify-center rounded-md bg-surface-2 text-fg-muted transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                    {getCategoryIcon(category.slug)}
                  </div>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-3xs font-medium text-fg-subtle transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                    <span className="nx-tnum font-semibold">{compactNumber(category.videoCount)}</span> titles
                  </span>
                </div>

                {/* Category Title & Description */}
                <h2 className="mt-2.5 text-xs font-semibold text-fg transition-colors group-hover:text-accent">
                  {category.name}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-fg-muted">
                  {category.description}
                </p>
              </div>

              {/* Bottom bar: Content Type label + hover indicator */}
              <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-3xs uppercase tracking-wider text-fg-subtle">
                <span className="truncate">{CONTENT_TYPE_LABELS[category.contentType]}</span>
                <IconChevronRight className="size-3 text-fg-subtle/50 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <BrowseView
        title="Everything on Nexus"
        description="Filter the whole catalogue by type, category, access model, language, age rating and release year."
      />
    </div>
  );
}
