"use client";

import Link from "next/link";
import * as React from "react";
import {
  IconBuildingCommunity,
  IconBuildingStore,
  IconCertificate,
  IconChevronDown,
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
import type { ContentType } from "@/lib/mock-api/types";
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

// Canonical group order for the 11 main categories (content types) — every one of the
// 104 real sub-categories belongs to exactly one of these, so this is also the grouping
// order below. Matches CONTENT_TYPE_LABELS' own declaration order.
const CONTENT_TYPE_ORDER = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];

export default function ExplorePage() {
  // Real data as of 2026-09-14 (docs/DEVELOPMENT-PLAN.md P1) — getCategories() now reads
  // Postgres via GET /api/categories/ instead of the in-memory mock store. BrowseView
  // below still uses searchVideos(), which is deliberately not yet swapped (see the
  // comment on getCategories() in src/lib/mock-api/index.ts for why).
  const { data: categories, isLoading } = useCategories();

  // Grouped by content type (the "main category") rather than one flat grid of all 104
  // — a flat grid of that many cards made it hard to tell how the set was organised, and
  // buried the handful of categories someone actually wants among the rest.
  const grouped = React.useMemo(() => {
    const byType = new Map<ContentType, typeof categories>();
    for (const category of categories ?? []) {
      const bucket = byType.get(category.contentType as ContentType);
      if (bucket) bucket.push(category);
      else byType.set(category.contentType as ContentType, [category]);
    }
    return CONTENT_TYPE_ORDER.map((type) => ({ type, items: byType.get(type) ?? [] })).filter(
      (group) => group.items.length > 0,
    );
  }, [categories]);

  // Collapsed by default — 104 categories across 11 groups rendered flat pushed "Everything
  // on Nexus" (the actual browse-everything tool) below a wall of cards nobody asked to
  // see yet. Now the categories are a quick-jump list you expand on demand, and the full
  // catalogue browser leads the page.
  const [expanded, setExpanded] = React.useState<Set<ContentType>>(() => new Set());
  const toggleExpanded = (type: ContentType) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div>
      <BrowseView
        title="Everything on Nexus"
        description="Filter the whole catalogue by type, category, access model, language, age rating and release year."
      />

      <section className="border-t border-border px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-fg sm:text-2xl">
              Browse by category
            </h2>
            <p className="mt-1 max-w-xl text-xs text-fg-muted">
              Expand a type to jump straight to one of its categories.
            </p>
          </div>
          <span className="text-2xs font-medium text-fg-subtle">
            {isLoading ? "Loading…" : `${categories?.length ?? 0} categories available`}
          </span>
        </div>
      </section>

      {isLoading ? null : (
        <div className="divide-y divide-border border-t border-border">
          {grouped.map((group) => {
            const isOpen = expanded.has(group.type);
            return (
              <section key={group.type}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.type)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 px-4 py-4 text-left transition-colors hover:bg-surface-2 sm:px-6 lg:px-8"
                >
                  <span className="flex items-center gap-2 font-display text-sm font-semibold text-fg">
                    {CONTENT_TYPE_LABELS[group.type]}
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-3xs font-medium text-fg-subtle nx-tnum">
                      {group.items.length}
                    </span>
                  </span>
                  <IconChevronDown
                    className={`size-4 text-fg-subtle transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen ? (
                  <div className="grid grid-cols-1 gap-2.5 px-4 pb-6 sm:grid-cols-2 sm:px-6 md:grid-cols-3 lg:grid-cols-4 lg:px-8 xl:grid-cols-5">
                    {group.items.map((category) => (
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
                          <h3 className="mt-2.5 text-xs font-semibold text-fg transition-colors group-hover:text-accent">
                            {category.name}
                          </h3>
                          <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-fg-muted">
                            {category.description}
                          </p>
                        </div>

                        {/* Bottom bar: hover indicator */}
                        <div className="mt-2.5 flex items-center justify-end border-t border-border/50 pt-2 text-3xs uppercase tracking-wider text-fg-subtle">
                          <IconChevronRight className="size-3 text-fg-subtle/50 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-accent" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
