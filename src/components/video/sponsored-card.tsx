"use client";

import { IconExternalLink } from "@tabler/icons-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Poster } from "./poster";
import { cn } from "@/lib/utils";

interface ServedAd {
  campaignId: string;
  creativeId: string;
  assetUrl: string;
  clickThroughUrl: string | null;
  durationSeconds: number;
}

export interface SponsoredCardProps {
  layout?: "wide" | "poster";
  className?: string;
}

/**
 * Sponsored card delivery for discovery rails and feeds (FR-6.8.2).
 * Displays a non-intrusive card clearly labelled as sponsored.
 * Renders nothing if no active sponsored-card campaign is servable.
 */
export function SponsoredCard({ layout = "wide", className }: SponsoredCardProps) {
  const [ad, setAd] = React.useState<ServedAd | null>(null);
  const [impressionId, setImpressionId] = React.useState<string | null>(null);
  const impressionSentRef = React.useRef(false);
  const impressionIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/ads/serve?placement=sponsored-card")
      .then((res) => (res.ok ? res.json() : { ad: null }))
      .then((body: { ad: ServedAd | null }) => {
        if (cancelled) return;
        setAd(body.ad);
      })
      .catch(() => {
        if (!cancelled) setAd(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!ad || impressionSentRef.current) return;
    impressionSentRef.current = true;
    fetch("/api/ads/impression/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: ad.campaignId,
        creativeId: ad.creativeId,
        placement: "sponsored-card",
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { impressionId: string } | null) => {
        if (body) {
          setImpressionId(body.impressionId);
          impressionIdRef.current = body.impressionId;
        }
      })
      .catch(() => {});
  }, [ad]);

  if (!ad) return null;

  const handleClick = () => {
    if (!ad.clickThroughUrl) return;
    const currentImpressionId = impressionIdRef.current || impressionId;
    if (currentImpressionId) {
      fetch("/api/ads/click/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId: currentImpressionId }),
      }).catch(() => {});
    }
    window.open(ad.clickThroughUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group/card relative flex cursor-pointer flex-col overflow-hidden rounded-lg transition-transform hover:-translate-y-0.5",
        className,
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg bg-surface-2",
          layout === "poster" ? "aspect-[2/3]" : "aspect-video",
        )}
      >
        {ad.assetUrl ? (
          <img src={ad.assetUrl} alt="Sponsored content" className="size-full object-cover" />
        ) : (
          <Poster
            alt="Sponsored"
            gradient={["#123A2E", "#05120E"]}
            seed={ad.campaignId}
            ratio={layout === "poster" ? "poster" : "video"}
            className="size-full"
          />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <Badge tone="accent" size="sm" className="bg-black/70 text-white backdrop-blur-sm">
            Sponsored
          </Badge>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-fg group-hover/card:text-accent">
            Featured Partner
          </h3>
          <IconExternalLink className="size-3.5 shrink-0 text-fg-muted" />
        </div>
        <p className="truncate text-xs text-fg-muted">Learn more from our sponsor</p>
      </div>
    </div>
  );
}
