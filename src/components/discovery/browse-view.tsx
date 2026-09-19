"use client";

import {
  IconAdjustmentsHorizontal,
  IconMoodEmpty,
  IconX,
} from "@tabler/icons-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { VideoGrid } from "@/components/video/rail";
import { CONTENT_TYPE_LABELS, categories } from "@/lib/mock-api/data/categories";
import { useSearchVideos, useToggleWatchlist, useWatchlist } from "@/lib/mock-api/hooks";
import type {
  AccessModel,
  AgeRating,
  ContentType,
  SearchFilters,
} from "@/lib/mock-api/types";
import { cn, formatNumber } from "@/lib/utils";

const ACCESS_LABELS: Record<AccessModel, string> = {
  free: "Free",
  "ad-supported": "Ad-supported",
  rent: "Rent",
  buy: "Buy",
  subscription: "Premium subscription",
  ppv: "Pay-per-view",
  membership: "Channel membership",
};

const AGE_RATINGS: AgeRating[] = ["U", "PG", "12", "15", "18"];

const DURATION_BANDS = [
  { id: "any", label: "Any length", min: undefined, max: undefined },
  { id: "short", label: "Under 5 min", min: undefined, max: 300 },
  { id: "medium", label: "5–20 min", min: 300, max: 1_200 },
  { id: "long", label: "20–60 min", min: 1_200, max: 3_600 },
  { id: "feature", label: "Over 1 hour", min: 3_600, max: undefined },
];

const SORTS: Array<{ value: NonNullable<SearchFilters["sort"]>; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "popular", label: "Most viewed" },
  { value: "newest", label: "Newest first" },
  { value: "rating", label: "Highest rated" },
  { value: "duration", label: "Longest first" },
];

export interface BrowseViewProps {
  title: string;
  description?: string;
  /** Locks a facet — used by the vertical pages (/films, /news, …). */
  lockedContentTypes?: ContentType[];
  lockedCategoryId?: string;
  initialQuery?: string;
  showQueryField?: boolean;
  layout?: "wide" | "poster";
}

export function BrowseView({
  title,
  description,
  lockedContentTypes,
  lockedCategoryId,
  initialQuery = "",
  showQueryField,
  layout = "wide",
}: BrowseViewProps) {
  const [query, setQuery] = React.useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = React.useState(initialQuery);
  const [contentTypes, setContentTypes] = React.useState<ContentType[]>([]);
  const [categoryIds, setCategoryIds] = React.useState<string[]>(
    lockedCategoryId ? [lockedCategoryId] : [],
  );
  const [accessModels, setAccessModels] = React.useState<AccessModel[]>([]);
  const [ageRatings, setAgeRatings] = React.useState<AgeRating[]>([]);
  const [languages, setLanguages] = React.useState<string[]>([]);
  const [countries, setCountries] = React.useState<string[]>([]);
  const [duration, setDuration] = React.useState("any");
  const [yearFrom, setYearFrom] = React.useState("");
  const [yearTo, setYearTo] = React.useState("");
  const [hasSubtitles, setHasSubtitles] = React.useState(false);
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [sort, setSort] = React.useState<NonNullable<SearchFilters["sort"]>>(
    initialQuery ? "relevance" : "popular",
  );
  const [panelOpen, setPanelOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const band = DURATION_BANDS.find((item) => item.id === duration)!;

  const filters = React.useMemo<SearchFilters>(
    () => ({
      query: debouncedQuery || undefined,
      contentTypes: lockedContentTypes ?? (contentTypes.length ? contentTypes : undefined),
      categoryIds: categoryIds.length ? categoryIds : undefined,
      accessModels: accessModels.length ? accessModels : undefined,
      ageRatings: ageRatings.length ? ageRatings : undefined,
      languages: languages.length ? languages : undefined,
      countries: countries.length ? countries : undefined,
      minDurationSeconds: band.min,
      maxDurationSeconds: band.max,
      releaseYearFrom: yearFrom ? Number(yearFrom) : undefined,
      releaseYearTo: yearTo ? Number(yearTo) : undefined,
      hasSubtitles: hasSubtitles || undefined,
      freeOnly: freeOnly || undefined,
      sort,
      pageSize: 60,
    }),
    [
      debouncedQuery,
      lockedContentTypes,
      contentTypes,
      categoryIds,
      accessModels,
      ageRatings,
      languages,
      countries,
      band,
      yearFrom,
      yearTo,
      hasSubtitles,
      freeOnly,
      sort,
    ],
  );

  const { data, isLoading } = useSearchVideos(filters);
  const { data: watchlist = [] } = useWatchlist();
  const toggleWatchlist = useToggleWatchlist();

  const relevantCategories = React.useMemo(
    () =>
      lockedContentTypes
        ? categories.filter((category) =>
            lockedContentTypes.includes(category.contentType),
          )
        : categories,
    [lockedContentTypes],
  );

  const activeFilterCount =
    (lockedContentTypes ? 0 : contentTypes.length) +
    (lockedCategoryId ? categoryIds.length - 1 : categoryIds.length) +
    accessModels.length +
    ageRatings.length +
    languages.length +
    countries.length +
    (duration !== "any" ? 1 : 0) +
    (yearFrom ? 1 : 0) +
    (yearTo ? 1 : 0) +
    (hasSubtitles ? 1 : 0) +
    (freeOnly ? 1 : 0);

  const clearAll = () => {
    setContentTypes([]);
    setCategoryIds(lockedCategoryId ? [lockedCategoryId] : []);
    setAccessModels([]);
    setAgeRatings([]);
    setLanguages([]);
    setCountries([]);
    setDuration("any");
    setYearFrom("");
    setYearTo("");
    setHasSubtitles(false);
    setFreeOnly(false);
  };

  const toggle = <T,>(list: T[], value: T, setter: (next: T[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const filterPanel = (
    <div className="space-y-6">
      {!lockedContentTypes ? (
        <FilterGroup label="Content type">
          {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((type) => (
            <FilterChip
              key={type}
              active={contentTypes.includes(type)}
              onClick={() => toggle(contentTypes, type, setContentTypes)}
              count={data?.facets.contentTypes.find((f) => f.value === type)?.count}
            >
              {CONTENT_TYPE_LABELS[type]}
            </FilterChip>
          ))}
        </FilterGroup>
      ) : null}

      <FilterGroup label="Category">
        {relevantCategories.map((category) => (
          <FilterChip
            key={category.id}
            active={categoryIds.includes(category.id)}
            disabled={category.id === lockedCategoryId}
            onClick={() => toggle(categoryIds, category.id, setCategoryIds)}
          >
            {category.name}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Access & price">
        {(Object.keys(ACCESS_LABELS) as AccessModel[]).map((model) => (
          <FilterChip
            key={model}
            active={accessModels.includes(model)}
            onClick={() => toggle(accessModels, model, setAccessModels)}
            count={data?.facets.accessModels.find((f) => f.value === model)?.count}
          >
            {ACCESS_LABELS[model]}
          </FilterChip>
        ))}
        <FilterChip active={freeOnly} onClick={() => setFreeOnly((v) => !v)}>
          Free to watch only
        </FilterChip>
      </FilterGroup>

      <FilterGroup label="Duration">
        {DURATION_BANDS.map((item) => (
          <FilterChip
            key={item.id}
            active={duration === item.id}
            onClick={() => setDuration(item.id)}
          >
            {item.label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Age rating">
        {AGE_RATINGS.map((rating) => (
          <FilterChip
            key={rating}
            active={ageRatings.includes(rating)}
            onClick={() => toggle(ageRatings, rating, setAgeRatings)}
          >
            {rating}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Language">
        {(data?.facets.languages ?? []).slice(0, 10).map((facet) => (
          <FilterChip
            key={facet.value}
            active={languages.includes(facet.value)}
            onClick={() => toggle(languages, facet.value, setLanguages)}
            count={facet.count}
          >
            {facet.value}
          </FilterChip>
        ))}
        <FilterChip active={hasSubtitles} onClick={() => setHasSubtitles((v) => !v)}>
          Has subtitles
        </FilterChip>
      </FilterGroup>

      <FilterGroup label="Country of origin">
        {(data?.facets.countries ?? []).slice(0, 10).map((facet) => (
          <FilterChip
            key={facet.value}
            active={countries.includes(facet.value)}
            onClick={() => toggle(countries, facet.value, setCountries)}
            count={facet.count}
          >
            {facet.value}
          </FilterChip>
        ))}
      </FilterGroup>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Released from" htmlFor="year-from">
          <Input
            id="year-from"
            type="number"
            inputMode="numeric"
            placeholder="1978"
            value={yearFrom}
            onChange={(event) => setYearFrom(event.target.value)}
            sizeVariant="sm"
          />
        </Field>
        <Field label="Released to" htmlFor="year-to">
          <Input
            id="year-to"
            type="number"
            inputMode="numeric"
            placeholder="2026"
            value={yearTo}
            onChange={(event) => setYearTo(event.target.value)}
            sizeVariant="sm"
          />
        </Field>
      </div>

      {activeFilterCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={clearAll} block>
          <IconX />
          Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Sort results"
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as NonNullable<SearchFilters["sort"]>)
            }
            sizeVariant="sm"
            className="w-44"
          >
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPanelOpen((current) => !current)}
            className="lg:hidden"
          >
            <IconAdjustmentsHorizontal />
            Filters
            {activeFilterCount > 0 ? (
              <Badge tone="accent" size="sm">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>

      {showQueryField ? (
        <div className="mt-4 max-w-xl">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, creators, cast, businesses…"
            aria-label="Search"
          />
        </div>
      ) : null}

      <div className="mt-6 flex gap-8">
        <aside
          className={cn(
            "w-64 shrink-0",
            panelOpen
              ? "fixed inset-0 z-50 w-full overflow-y-auto bg-bg p-4 lg:static lg:z-auto lg:w-64 lg:bg-transparent lg:p-0"
              : "hidden lg:block",
          )}
        >
          {panelOpen ? (
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <p className="font-display text-lg font-semibold">Filters</p>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close filters"
                onClick={() => setPanelOpen(false)}
              >
                <IconX />
              </Button>
            </div>
          ) : null}
          {filterPanel}
          {panelOpen ? (
            <Button
              variant="primary"
              block
              className="mt-6 lg:hidden"
              onClick={() => setPanelOpen(false)}
            >
              Show {formatNumber(data?.total ?? 0)} results
            </Button>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <p className="mb-4 text-sm text-fg-muted nx-tnum">
            {isLoading
              ? "Searching…"
              : `${formatNumber(data?.total ?? 0)} ${
                  (data?.total ?? 0) === 1 ? "title" : "titles"
                }`}
            {debouncedQuery ? ` for “${debouncedQuery}”` : ""}
          </p>

          {isLoading ? (
            <RailSkeleton count={12} wide={layout === "wide"} />
          ) : data && data.items.length > 0 ? (
            <VideoGrid
              videos={data.items}
              layout={layout}
              watchlist={watchlist.map((item) => item.id)}
              onToggleWatchlist={(id) => toggleWatchlist.mutate(id)}
            />
          ) : (
            <EmptyState
              icon={<IconMoodEmpty />}
              title="Nothing matches those filters"
              description="Try widening the age rating, removing a language filter, or clearing the release-year range."
              action={
                activeFilterCount > 0
                  ? { label: "Clear all filters", onClick: clearAll }
                  : { label: "Browse everything", href: "/explore" }
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {label}
      </h2>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  count,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-accent bg-accent/10 font-medium text-accent-hover"
          : "border-border bg-surface-2 text-fg-muted hover:border-border-strong hover:text-fg",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {children}
      {count != null ? (
        <span className="text-2xs text-fg-subtle nx-tnum">{count}</span>
      ) : null}
    </button>
  );
}
