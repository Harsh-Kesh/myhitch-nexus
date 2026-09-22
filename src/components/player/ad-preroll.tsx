"use client";

import { IconPlayerSkipForwardFilled, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ServedAd {
  campaignId: string;
  creativeId: string;
  assetUrl: string;
  clickThroughUrl: string | null;
  durationSeconds: number;
}

const SKIPPABLE_AFTER_SECONDS = 5;

export interface AdPrerollProps {
  videoId: string;
  onDone: () => void;
  placement?: "pre-roll" | "mid-roll" | "post-roll";
}

/**
 * The real video ad phase (P6) — gates the first content play in both VideoPlayer and
 * AudioPlayer (pre-roll), and also delivers mid-roll and post-roll video ads.
 * Deliberately a separate small <video> element and its own tiny state
 * machine rather than an extension of usePlayback(): that hook's job is the content
 * timeline (simulated-vs-real, resume position, preview limits), and folding a second,
 * unrelated media source through the same ref/state would make both harder to reason
 * about. `onDone` fires exactly once — no ad found, ad finishes, ad fails to load, or the
 * viewer skips it — and the caller then continues real content playback.
 */
export function AdPreroll({ videoId, onDone, placement = "pre-roll" }: AdPrerollProps) {
  const [ad, setAd] = React.useState<ServedAd | null | "pending">("pending");
  const [impressionId, setImpressionId] = React.useState<string | null>(null);
  const impressionIdRef = React.useRef<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const doneRef = React.useRef(false);
  const impressionSentRef = React.useRef(false);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/serve/?videoId=${encodeURIComponent(videoId)}&placement=${placement}`)
      .then((res) => (res.ok ? res.json() : { ad: null }))
      .then((body: { ad: ServedAd | null }) => {
        if (cancelled) return;
        setAd(body.ad);
        if (!body.ad) finish();
      })
      .catch(() => {
        if (!cancelled) {
          setAd(null);
          finish();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, placement, finish]);

  const recordImpression = React.useCallback(() => {
    if (impressionSentRef.current || !ad || ad === "pending") return;
    impressionSentRef.current = true;
    fetch("/api/ads/impression/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: ad.campaignId,
        creativeId: ad.creativeId,
        videoId,
        placement,
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
  }, [ad, videoId, placement]);

  const handleEnded = React.useCallback(() => {
    const currentImpressionId = impressionIdRef.current || impressionId;
    if (currentImpressionId) {
      fetch("/api/ads/complete/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impressionId: currentImpressionId }),
      }).catch(() => {});
    }
    finish();
  }, [impressionId, finish]);

  const handleClickThrough = () => {
    if (!ad || ad === "pending" || !ad.clickThroughUrl) return;
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

  if (!ad || ad === "pending") return null;

  const canSkip = elapsed >= SKIPPABLE_AFTER_SECONDS;
  const remaining = Math.max(0, Math.ceil(ad.durationSeconds - elapsed));
  const badgeLabel =
    placement === "mid-roll"
      ? `Mid-roll · ${remaining}s`
      : placement === "post-roll"
        ? `Post-roll · ${remaining}s`
        : `Ad · ${remaining}s`;

  return (
    <div className="absolute inset-0 z-20 bg-black">
      <video
        ref={videoRef}
        src={ad.assetUrl}
        autoPlay
        muted={muted}
        playsInline
        className="size-full object-contain"
        onPlay={recordImpression}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onEnded={handleEnded}
        onError={finish}
      />

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <Badge tone="outline" size="sm" className="bg-black/60 text-white backdrop-blur-sm">
          {badgeLabel}
        </Badge>
      </div>

      <button
        type="button"
        onClick={() => setMuted((current) => !current)}
        aria-label={muted ? "Unmute ad" : "Mute ad"}
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        {muted ? <IconVolumeOff className="size-4" /> : <IconVolume className="size-4" />}
      </button>

      {ad.clickThroughUrl ? (
        <button
          type="button"
          onClick={handleClickThrough}
          className="absolute inset-x-0 bottom-14 mx-auto w-fit rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          Learn more
        </button>
      ) : null}

      <div className="absolute bottom-3 right-3">
        {canSkip ? (
          <Button size="sm" variant="overlay" onClick={finish}>
            Skip ad
            <IconPlayerSkipForwardFilled className="size-3.5" />
          </Button>
        ) : (
          <Badge tone="outline" size="sm" className="bg-black/60 text-white backdrop-blur-sm">
            Skip in {Math.max(0, Math.ceil(SKIPPABLE_AFTER_SECONDS - elapsed))}s
          </Badge>
        )}
      </div>
    </div>
  );
}

export const AdRoll = AdPreroll;
