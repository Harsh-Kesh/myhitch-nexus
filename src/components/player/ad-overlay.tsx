"use client";

import { IconExternalLink, IconX } from "@tabler/icons-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";

interface ServedAd {
  campaignId: string;
  creativeId: string;
  assetUrl: string;
  clickThroughUrl: string | null;
  durationSeconds: number;
}

export interface AdOverlayProps {
  videoId: string;
  currentTime: number;
  playing: boolean;
}

/**
 * Non-linear overlay ad delivery (FR-6.8.2).
 * Displays a dismissible banner / lower-third card during active playback.
 * Does not interrupt the content timeline.
 */
export function AdOverlay({ videoId, currentTime, playing }: AdOverlayProps) {
  const [ad, setAd] = React.useState<ServedAd | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [impressionId, setImpressionId] = React.useState<string | null>(null);
  const impressionSentRef = React.useRef(false);
  const impressionIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/serve/?videoId=${encodeURIComponent(videoId)}&placement=overlay`)
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
  }, [videoId]);

  // Display overlay between 10s and 40s into content playback
  const isVisible = Boolean(ad && !dismissed && playing && currentTime >= 10 && currentTime < 40);

  React.useEffect(() => {
    if (!isVisible || !ad || impressionSentRef.current) return;
    impressionSentRef.current = true;
    fetch("/api/ads/impression/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: ad.campaignId,
        creativeId: ad.creativeId,
        videoId,
        placement: "overlay",
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
  }, [isVisible, ad, videoId]);

  if (!isVisible || !ad) return null;

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
    <div className="absolute bottom-20 left-4 z-20 max-w-sm animate-slide-up rounded-lg border border-white/20 bg-black/85 p-3 text-white shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 pb-2">
        <Badge tone="outline" size="sm" className="bg-black/60 text-white backdrop-blur-sm">
          Sponsored
        </Badge>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss ad"
          className="flex size-6 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <IconX className="size-3.5" />
        </button>
      </div>

      {ad.assetUrl ? (
        <div className="mb-2 overflow-hidden rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ad.assetUrl} alt="Ad banner" className="h-24 w-full object-cover" />
        </div>
      ) : null}

      {ad.clickThroughUrl ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          <span>Learn more</span>
          <IconExternalLink className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
