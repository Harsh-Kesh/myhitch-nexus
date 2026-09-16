"use client";

import { IconAward } from "@tabler/icons-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePublishedSponsorshipListings } from "@/lib/mock-api/hooks";
import { SPONSORSHIP_REWARD_LABELS } from "@/lib/mock-api/types";
import { formatDate } from "@/lib/utils";

export function ExchangeIndexClient() {
  const { data: listings = [], isLoading } = usePublishedSponsorshipListings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">Exchange Hub</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
        Creators pitching their films and projects for sponsorship — the story, the trailer,
        and what a sponsor gets in return. Every reward here is exposure or recognition, never
        a share of profits or revenue.
      </p>

      <div className="mt-8 space-y-6">
        {isLoading ? null : listings.length === 0 ? (
          <EmptyState
            icon={<IconAward />}
            title="Nothing published yet"
            description="Creators can submit a sponsorship pitch from Creator Studio."
          />
        ) : (
          listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/exchange/${listing.slug}`}
              className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent" size="sm">
                  Sponsorship pitch
                </Badge>
                <span className="text-2xs text-fg-subtle nx-tnum">
                  {listing.publishedAt ? formatDate(listing.publishedAt, "long") : ""}
                </span>
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold text-fg">{listing.projectName}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {listing.rewardTypes.map((reward) => (
                  <Badge key={reward} tone="neutral" size="sm">
                    {SPONSORSHIP_REWARD_LABELS[reward]}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-xs text-fg-subtle">
                By {listing.authorName} · {listing.channelName}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
