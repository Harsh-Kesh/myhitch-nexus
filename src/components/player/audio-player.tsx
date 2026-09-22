"use client";

import {
  IconAlertTriangle,
  IconClock,
  IconLock,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconRotateClockwise,
  IconVolume,
  IconVolume2,
  IconVolume3,
  IconWorldOff,
} from "@tabler/icons-react";
import * as React from "react";
import { Poster } from "@/components/video/poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSaveWatchProgress } from "@/lib/mock-api/hooks";
import type { Entitlement, Video } from "@/lib/mock-api/types";
import { clamp, cn, formatCurrency, formatDuration } from "@/lib/utils";
import { AdPreroll } from "./ad-preroll";
import { BlockedSurface, PaywallSurface } from "./video-player";
import { usePlayback } from "./use-playback";

export interface AudioPlayerProps {
  video: Video;
  entitlement: Entitlement;
  resumeAt?: number;
  onRequestPurchase?: () => void;
  onCommerceClick?: (linkId: string) => void;
  className?: string;
}

/** Reuses the same blocked/paywall/resume/entitlement/commerce logic as VideoPlayer, and
 * the same usePlayback() engine (an <audio> element only needs HTMLMediaElement members) —
 * everything genuinely video-shaped (aspect-video sizing, poster-as-frame, picture-in-
 * picture, fullscreen, the on-screen watermark) is dropped rather than adapted, since none
 * of it means anything for audio-only content. */
export function AudioPlayer({
  video,
  entitlement,
  resumeAt = 0,
  onRequestPurchase,
  onCommerceClick,
  className,
}: AudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const saveProgress = useSaveWatchProgress();

  const [started, setStarted] = React.useState(false);
  const [showResume, setShowResume] = React.useState(resumeAt > 30);
  const [limitReached, setLimitReached] = React.useState(false);
  // Real pre-roll gate (P6) — see VideoPlayer's identical mechanism for the reasoning.
  const [adGate, setAdGate] = React.useState(false);
  const adShownRef = React.useRef(false);

  const previewLimit =
    !entitlement.granted && entitlement.reason === "preview"
      ? (entitlement.previewSeconds ?? 120)
      : undefined;

  const [state, controls] = usePlayback({
    videoRef: audioRef,
    duration: video.durationSeconds,
    startAt: showResume ? 0 : resumeAt,
    limitSeconds: previewLimit,
    onLimitReached: () => setLimitReached(true),
    onTimeUpdate: (seconds) => {
      if (entitlement.granted) {
        saveProgress.mutate({ videoId: video.id, position: seconds, duration: video.durationSeconds });
      }
    },
  });

  const beginPlayback = () => {
    if (!adShownRef.current) {
      adShownRef.current = true;
      setAdGate(true);
      return;
    }
    controls.play();
  };

  React.useEffect(() => {
    if (!started) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName) || target.isContentEditable) return;
      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          controls.toggle();
          break;
        case "ArrowRight":
        case "l":
          controls.skip(10);
          break;
        case "ArrowLeft":
        case "j":
          controls.skip(-10);
          break;
        case "m":
          controls.toggleMute();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, controls]);

  if (video.processingStatus === "awaiting_transcode") {
    return (
      <BlockedSurface
        video={video}
        className={className}
        icon={<IconClock />}
        title="Still processing"
        description="This upload finished successfully, but playback isn't available yet. Check back once it's finished processing."
      />
    );
  }

  if (entitlement.blockReason === "geo-restricted") {
    return (
      <BlockedSurface
        video={video}
        className={className}
        icon={<IconWorldOff />}
        title="Not available in your region"
        description={
          <>
            The rights holder has not licensed this title for{" "}
            <strong className="text-fg">{entitlement.requestCountry}</strong>.
          </>
        }
        action={
          <Button variant="secondary" href="/explore">
            Browse what is available here
          </Button>
        }
      />
    );
  }

  if (entitlement.blockReason === "unavailable") {
    return (
      <BlockedSurface
        video={video}
        className={className}
        icon={<IconAlertTriangle />}
        title="This upload is unavailable"
        description="It has been restricted or removed while under review. Anyone who purchased it keeps access to their receipt in Purchases."
        action={
          <Button variant="secondary" href="/explore">
            Back to browsing
          </Button>
        }
      />
    );
  }

  if (!entitlement.granted && !started) {
    return (
      <PaywallSurface
        video={video}
        entitlement={entitlement}
        className={className}
        onPreview={() => {
          setStarted(true);
          setShowResume(false);
          beginPlayback();
        }}
        onPurchase={onRequestPurchase}
      />
    );
  }

  const activeCommerce = video.pricing.affiliateLinks?.find(
    (link) =>
      link.timestampSeconds != null &&
      state.currentTime >= link.timestampSeconds &&
      state.currentTime < link.timestampSeconds + 25,
  );

  const VolumeIcon = state.muted || state.volume === 0 ? IconVolume3 : state.volume < 0.5 ? IconVolume2 : IconVolume;

  return (
    <div
      data-surface="cinema"
      className={cn("relative aspect-square w-full max-w-md overflow-hidden rounded-lg bg-black sm:aspect-video", className)}
    >
      <Poster
        src={video.thumbnailUrl}
        alt={video.title}
        gradient={video.posterGradient}
        seed={video.id}
        ratio="none"
        className="absolute inset-0 size-full"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      <audio ref={audioRef} preload="metadata" src={video.sampleSrc} onClick={controls.toggle} />

      {state.simulated ? (
        <div className="pointer-events-none absolute right-3 top-3">
          <Badge tone="outline" size="sm" className="bg-black/55 backdrop-blur-sm">
            Simulated playback — no media file
          </Badge>
        </div>
      ) : null}

      {showResume ? (
        <div className="absolute inset-x-0 bottom-20 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-black/80 px-4 py-3 backdrop-blur-sm">
            <IconRotateClockwise className="size-4 text-accent" />
            <p className="text-sm text-white">
              Resume from <span className="font-semibold nx-tnum">{formatDuration(resumeAt)}</span>?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  controls.seek(resumeAt);
                  setShowResume(false);
                  setStarted(true);
                  beginPlayback();
                }}
              >
                Resume
              </Button>
              <Button
                size="sm"
                variant="overlay"
                onClick={() => {
                  controls.seek(0);
                  setShowResume(false);
                }}
              >
                Start over
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {activeCommerce ? (
        <div className="absolute bottom-24 left-3 right-3 animate-slide-up">
          <button
            type="button"
            onClick={() => onCommerceClick?.(activeCommerce.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-black/80 p-2.5 text-left backdrop-blur-sm transition-colors hover:bg-black/90"
          >
            <span className="min-w-0">
              <span className="block text-2xs uppercase tracking-wide text-white/55">{activeCommerce.label}</span>
              <span className="block truncate text-sm font-medium text-white">{activeCommerce.productName}</span>
              <span className="block text-xs text-white/70 nx-tnum">
                {formatCurrency(activeCommerce.price.amount, activeCommerce.price.currency)}
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {limitReached ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IconLock className="size-6" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">That is the end of the preview</h2>
            <p className="mt-1 max-w-md text-sm text-white/70">
              You listened to {formatDuration(previewLimit ?? 120)} of {formatDuration(video.durationSeconds)}. Unlock
              the full title to keep listening.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={onRequestPurchase}>
              Unlock full audio
            </Button>
            <Button
              variant="overlay"
              onClick={() => {
                setLimitReached(false);
                controls.seek(0);
              }}
            >
              Replay preview
            </Button>
          </div>
        </div>
      ) : null}

      {!state.playing && !limitReached && !showResume && !adGate ? (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
            beginPlayback();
          }}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform hover:scale-105 sm:size-20">
            <IconPlayerPlayFilled className="size-7 translate-x-0.5 sm:size-9" />
          </span>
        </button>
      ) : null}

      {adGate ? (
        <AdPreroll
          videoId={video.id}
          onDone={() => {
            setAdGate(false);
            controls.play();
          }}
        />
      ) : null}

      {/* Transport chrome — a leaner bar than VideoPlayer's: no quality/subtitle/fullscreen/
          pip/cast, none of which mean anything for an audio-only stream. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-8">
        <AudioScrubber state={state} controls={controls} limitSeconds={previewLimit} />
        <div className="flex items-center gap-1">
          <TransportButton label={state.playing ? "Pause" : "Play"} onClick={controls.toggle} large>
            {state.playing ? <IconPlayerPauseFilled className="size-5" /> : <IconPlayerPlayFilled className="size-5" />}
          </TransportButton>
          <TransportButton label="Back 10 seconds" onClick={() => controls.skip(-10)}>
            <IconPlayerSkipBackFilled className="size-4" />
          </TransportButton>
          <TransportButton label="Forward 10 seconds" onClick={() => controls.skip(10)}>
            <IconPlayerSkipForwardFilled className="size-4" />
          </TransportButton>
          <span className="ml-1 text-xs text-white/80 nx-tnum">
            {formatDuration(state.currentTime)} / {formatDuration(state.duration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <TransportButton label={state.muted ? "Unmute" : "Mute"} onClick={controls.toggleMute}>
              <VolumeIcon className="size-4" />
            </TransportButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              onChange={(event) => controls.setVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-16 accent-accent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  children,
  label,
  onClick,
  large,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white",
        large ? "size-10" : "size-9",
      )}
    >
      {children}
    </button>
  );
}

function AudioScrubber({
  state,
  controls,
  limitSeconds,
}: {
  state: ReturnType<typeof usePlayback>[0];
  controls: ReturnType<typeof usePlayback>[1];
  limitSeconds?: number;
}) {
  const scrubberRef = React.useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = React.useState(false);

  const percent = state.duration ? (state.currentTime / state.duration) * 100 : 0;
  const bufferedPercent = state.duration ? (state.buffered / state.duration) * 100 : 0;
  const limitPercent = limitSeconds != null && state.duration ? (limitSeconds / state.duration) * 100 : null;

  const timeFromEvent = React.useCallback(
    (clientX: number) => {
      const rect = scrubberRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * state.duration;
    },
    [state.duration],
  );

  React.useEffect(() => {
    if (!scrubbing) return;
    const onMove = (event: PointerEvent) => controls.seek(timeFromEvent(event.clientX));
    const onUp = () => setScrubbing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, controls, timeFromEvent]);

  return (
    <div
      ref={scrubberRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(state.duration)}
      aria-valuenow={Math.round(state.currentTime)}
      aria-valuetext={`${formatDuration(state.currentTime)} of ${formatDuration(state.duration)}`}
      onPointerDown={(event) => {
        setScrubbing(true);
        controls.seek(timeFromEvent(event.clientX));
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") controls.skip(5);
        if (event.key === "ArrowLeft") controls.skip(-5);
      }}
      className="group/scrub relative mb-2 h-4 cursor-pointer touch-none px-1"
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/scrub:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${bufferedPercent}%` }} />
        {limitPercent != null ? (
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.22)_0_4px,transparent_4px_8px)]"
            style={{ left: `${limitPercent}%`, right: 0 }}
          />
        ) : null}
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <div
        className={cn(
          "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-transform",
          scrubbing ? "scale-125" : "scale-0 group-hover/scrub:scale-100",
        )}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}
