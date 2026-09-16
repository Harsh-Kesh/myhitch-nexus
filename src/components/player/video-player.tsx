"use client";

import {
  IconAlertTriangle,
  IconClock,
  IconLock,
  IconPlayerPlayFilled,
  IconRotateClockwise,
  IconShoppingBag,
  IconWorldOff,
} from "@tabler/icons-react";
import * as React from "react";
import { Poster } from "@/components/video/poster";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSaveWatchProgress } from "@/lib/mock-api/hooks";
import type { Entitlement, Video } from "@/lib/mock-api/types";
import { cn, formatCurrency, formatDuration } from "@/lib/utils";
import { PlayerControls } from "./player-controls";
import { usePlayback } from "./use-playback";

export interface VideoPlayerProps {
  video: Video;
  entitlement: Entitlement;
  resumeAt?: number;
  onRequestPurchase?: () => void;
  onCommerceClick?: (linkId: string) => void;
  /** Live pages hide the scrubber affordances that imply seeking a VOD. */
  live?: boolean;
  className?: string;
}

export function VideoPlayer({
  video,
  entitlement,
  resumeAt = 0,
  onRequestPurchase,
  onCommerceClick,
  live,
  className,
}: VideoPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const saveProgress = useSaveWatchProgress();

  const [started, setStarted] = React.useState(false);
  const [showResume, setShowResume] = React.useState(resumeAt > 30);
  const [limitReached, setLimitReached] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [pip, setPip] = React.useState(false);
  const [castNotice, setCastNotice] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);

  const [quality, setQuality] = React.useState("auto");
  const [subtitle, setSubtitle] = React.useState(
    video.subtitles[0]?.id ?? "off",
  );
  const [audioTrack, setAudioTrack] = React.useState(
    video.audioTracks[0]?.id ?? "",
  );

  const previewLimit =
    !entitlement.granted && entitlement.reason === "preview"
      ? (entitlement.previewSeconds ?? 120)
      : undefined;

  const [state, controls] = usePlayback({
    videoRef,
    duration: video.durationSeconds,
    startAt: showResume ? 0 : resumeAt,
    limitSeconds: previewLimit,
    onLimitReached: () => setLimitReached(true),
    onTimeUpdate: (seconds) => {
      if (entitlement.granted) {
        saveProgress.mutate({
          videoId: video.id,
          position: seconds,
          duration: video.durationSeconds,
        });
      }
    },
  });

  /* --------------------------- Fullscreen / PiP -------------------------- */

  React.useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen().catch(() => {
        // Some browsers refuse without a real media element; reflect it anyway
        // so the control still reads as toggled in the demo.
        setFullscreen((current) => !current);
      });
    }
  };

  const togglePip = () => setPip((current) => !current);

  const handleCast = () => {
    setCastNotice(true);
    window.setTimeout(() => setCastNotice(false), 2_600);
  };

  /* ------------------------------ Keyboard ------------------------------- */

  React.useEffect(() => {
    if (!started) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          controls.toggle();
          break;
        case "ArrowRight":
          controls.skip(5);
          break;
        case "ArrowLeft":
          controls.skip(-5);
          break;
        case "j":
          controls.skip(-10);
          break;
        case "l":
          controls.skip(10);
          break;
        case "m":
          controls.toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, controls]);

  /* ------------------------- Auto-hide the chrome ------------------------ */

  const hideTimer = React.useRef<number | null>(null);
  const bumpControls = React.useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (state.playing) setControlsVisible(false);
    }, 2_800);
  }, [state.playing]);

  React.useEffect(() => {
    bumpControls();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [bumpControls]);

  /* ------------------------------- Blocked ------------------------------- */

  // A real upload with no playable stream yet — real video transcoding is still
  // blocked on a Mux account (docs/DEVELOPMENT-PLAN.md's P2 entry). Checked before
  // entitlement/paywall states since there is genuinely nothing to play regardless of
  // what the viewer is entitled to.
  if (video.processingStatus === "awaiting_transcode") {
    return (
      <BlockedSurface
        video={video}
        className={className}
        icon={<IconClock />}
        title="Still processing"
        description="This video was uploaded successfully, but playback isn't available yet. Check back once it's finished processing."
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
            {video.rights.permittedCountries.length > 0 ? (
              <>
                {" "}
                It is currently available in{" "}
                {video.rights.permittedCountries.slice(0, 6).join(", ")}
                {video.rights.permittedCountries.length > 6 ? " and others" : ""}.
              </>
            ) : null}
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
        title="This video is unavailable"
        description="It has been restricted or removed while under review. Anyone who purchased it keeps access to their receipt in Purchases."
        action={
          <Button variant="secondary" href="/explore">
            Back to browsing
          </Button>
        }
      />
    );
  }

  // Paid content, never started: show the paywall in place of the player.
  if (!entitlement.granted && !started) {
    return (
      <PaywallSurface
        video={video}
        entitlement={entitlement}
        className={className}
        onPreview={() => {
          setStarted(true);
          setShowResume(false);
          controls.play();
        }}
        onPurchase={onRequestPurchase}
      />
    );
  }

  const activeQuality =
    quality === "auto"
      ? (video.qualities.find((level) => level.height === 1080) ?? video.qualities[0])
      : video.qualities.find((level) => level.id === quality);

  const activeSubtitle = video.subtitles.find((track) => track.id === subtitle);
  const activeCommerce = video.pricing.affiliateLinks?.find(
    (link) =>
      link.timestampSeconds != null &&
      state.currentTime >= link.timestampSeconds &&
      state.currentTime < link.timestampSeconds + 25,
  );

  return (
    <div
      ref={containerRef}
      data-surface="cinema"
      onMouseMove={bumpControls}
      onTouchStart={bumpControls}
      className={cn(
        "group/player relative aspect-video w-full overflow-hidden bg-black",
        fullscreen ? "rounded-none" : "rounded-lg",
        !controlsVisible && state.playing && "cursor-none",
        className,
      )}
    >
      {/* Poster stands in whenever no real media is decoded. */}
      <Poster
        src={video.thumbnailUrl}
        alt={video.title}
        gradient={video.posterGradient}
        seed={video.id}
        ratio="none"
        className="absolute inset-0 size-full"
      />

      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-contain"
        playsInline
        preload="metadata"
        poster=""
        // A local sample if one is present; the engine falls back cleanly when
        // it is not. No streaming manifest or DRM licence server is involved.
        src={video.sampleSrc}
        onClick={controls.toggle}
      />

      {/* Click-to-toggle layer above the poster, below the chrome. */}
      <button
        type="button"
        aria-label={state.playing ? "Pause" : "Play"}
        onClick={controls.toggle}
        onDoubleClick={toggleFullscreen}
        className="absolute inset-0 size-full cursor-pointer"
      />

      {/* Forensic-watermark demonstration. Visual only — see §12. */}
      {video.watermarkEnabled ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-start justify-end p-4"
        >
          <span className="rounded bg-black/25 px-2 py-1 font-mono text-2xs tracking-widest text-white/35">
            NX·usr_viewer·{video.id.slice(-6).toUpperCase()}
          </span>
        </div>
      ) : null}

      {live ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <LiveBadge />
        </div>
      ) : null}

      {state.simulated ? (
        <div className="pointer-events-none absolute right-3 top-3">
          <Badge tone="outline" size="sm" className="bg-black/55 backdrop-blur-sm">
            Simulated playback — no media file
          </Badge>
        </div>
      ) : null}

      {/* Subtitle rendering */}
      {activeSubtitle && subtitle !== "off" && state.playing ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center px-8">
          <p className="max-w-2xl rounded bg-black/70 px-3 py-1.5 text-center text-sm leading-snug text-white sm:text-base">
            {sampleCaption(state.currentTime, activeSubtitle.language)}
          </p>
        </div>
      ) : null}

      {/* Resume prompt */}
      {showResume ? (
        <div className="absolute inset-x-0 bottom-20 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-black/80 px-4 py-3 backdrop-blur-sm">
            <IconRotateClockwise className="size-4 text-accent" />
            <p className="text-sm text-white">
              Resume from{" "}
              <span className="font-semibold nx-tnum">{formatDuration(resumeAt)}</span>?
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  controls.seek(resumeAt);
                  setShowResume(false);
                  setStarted(true);
                  controls.play();
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

      {/* Commerce card — "Shop this video" */}
      {activeCommerce ? (
        <div className="absolute bottom-24 left-3 max-w-[17rem] animate-slide-up">
          <button
            type="button"
            onClick={() => onCommerceClick?.(activeCommerce.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-black/80 p-2.5 text-left backdrop-blur-sm transition-colors hover:bg-black/90"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent text-accent-fg">
              <IconShoppingBag className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-2xs uppercase tracking-wide text-white/55">
                {activeCommerce.label}
              </span>
              <span className="block truncate text-sm font-medium text-white">
                {activeCommerce.productName}
              </span>
              <span className="block text-xs text-white/70 nx-tnum">
                {formatCurrency(
                  activeCommerce.price.amount,
                  activeCommerce.price.currency,
                )}
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {castNotice ? (
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <Badge tone="outline" className="bg-black/80 backdrop-blur-sm">
            Cast is a UI demonstration — no devices are discovered
          </Badge>
        </div>
      ) : null}

      {/* Preview limit reached */}
      {limitReached ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IconLock className="size-6" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              That is the end of the preview
            </h2>
            <p className="mt-1 max-w-md text-sm text-white/70">
              You watched {formatDuration(previewLimit ?? 120)} of{" "}
              {formatDuration(video.durationSeconds)}. Unlock the full title to keep
              watching.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={onRequestPurchase}>
              Unlock full video
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

      {/* Big centre play button before first interaction */}
      {!state.playing && !limitReached && !showResume ? (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
            controls.play();
          }}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform hover:scale-105 sm:size-20">
            <IconPlayerPlayFilled className="size-7 translate-x-0.5 sm:size-9" />
          </span>
        </button>
      ) : null}

      {/* Chrome */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 transition-opacity duration-200",
          controlsVisible || !state.playing
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        {previewLimit != null ? (
          <div className="mx-3 mb-1 flex w-fit items-center gap-2 rounded bg-black/70 px-2.5 py-1 backdrop-blur-sm">
            <IconLock className="size-3 text-warning" />
            <span className="text-2xs text-white/85">
              Preview — {formatDuration(previewLimit)} of{" "}
              {formatDuration(video.durationSeconds)}
            </span>
          </div>
        ) : null}
        <PlayerControls
          state={state}
          controls={controls}
          qualities={video.qualities}
          subtitles={video.subtitles}
          audioTracks={video.audioTracks}
          quality={quality === "auto" ? "auto" : (activeQuality?.id ?? "auto")}
          onQualityChange={setQuality}
          subtitle={subtitle}
          onSubtitleChange={setSubtitle}
          audioTrack={audioTrack}
          onAudioTrackChange={setAudioTrack}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          pip={pip}
          onTogglePip={togglePip}
          onCast={handleCast}
          limitSeconds={previewLimit}
        />
      </div>

      {pip ? (
        <div className="pointer-events-none absolute bottom-24 right-3 w-40 overflow-hidden rounded border border-white/20 shadow-lg">
          <Poster src={video.thumbnailUrl} alt={video.title} gradient={video.posterGradient} seed={`${video.id}-pip`} ratio="video" />
          <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-2xs text-white/80">
            Picture in picture (UI only)
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------- Blocked surfaces ---------------------------- */

function BlockedSurface({
  video,
  icon,
  title,
  description,
  action,
  className,
}: {
  video: Video;
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-surface="cinema"
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg bg-black",
        className,
      )}
    >
      <Poster
        src={video.thumbnailUrl}
        alt={video.title}
        gradient={video.posterGradient}
        seed={video.id}
        ratio="none"
        className="absolute inset-0 size-full opacity-35"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/65 px-6 text-center backdrop-blur-[2px]">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-3 text-fg-muted [&_svg]:size-6">
          {icon}
        </span>
        <div>
          {/* A heading, not a styled paragraph: this surface replaces the
              player entirely, so it needs to be reachable by screen-reader
              heading navigation. */}
          <h2 className="font-display text-lg font-semibold text-fg">{title}</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
            {description}
          </p>
        </div>
        {action}
      </div>
    </div>
  );
}

function PaywallSurface({
  video,
  entitlement,
  onPreview,
  onPurchase,
  className,
}: {
  video: Video;
  entitlement: Entitlement;
  onPreview: () => void;
  onPurchase?: () => void;
  className?: string;
}) {
  const { rentPrice, buyPrice, ppvPrice, accessModels, rentalWindowHours } =
    video.pricing;

  return (
    <div
      data-surface="cinema"
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg bg-black",
        className,
      )}
    >
      <Poster
        src={video.thumbnailUrl}
        alt={video.title}
        gradient={video.posterGradient}
        seed={video.id}
        ratio="none"
        className="absolute inset-0 size-full opacity-45"
      />
      <div className="absolute inset-0 nx-scrim" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5 text-center sm:px-8">
        <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconLock className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-fg sm:text-xl">
            Unlock to watch in full
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
            {entitlement.previewSeconds
              ? `A ${formatDuration(entitlement.previewSeconds)} preview is available before you decide.`
              : "This title requires an entitlement."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {accessModels.includes("rent") && rentPrice ? (
            <Button variant="primary" onClick={onPurchase}>
              Rent {formatCurrency(rentPrice.amount, rentPrice.currency)}
              <span className="font-normal opacity-70">
                · {rentalWindowHours ?? 48}h
              </span>
            </Button>
          ) : null}
          {accessModels.includes("buy") && buyPrice ? (
            <Button
              variant={accessModels.includes("rent") ? "secondary" : "primary"}
              onClick={onPurchase}
            >
              Buy {formatCurrency(buyPrice.amount, buyPrice.currency)}
            </Button>
          ) : null}
          {accessModels.includes("ppv") && ppvPrice ? (
            <Button variant="primary" onClick={onPurchase}>
              Buy access {formatCurrency(ppvPrice.amount, ppvPrice.currency)}
            </Button>
          ) : null}
          {accessModels.includes("subscription") ? (
            <Button variant="secondary" onClick={onPurchase}>
              Included with Premium
            </Button>
          ) : null}
          {accessModels.includes("membership") ? (
            <Button variant="secondary" onClick={onPurchase}>
              Join the membership
            </Button>
          ) : null}
        </div>

        {entitlement.previewSeconds ? (
          <Button variant="ghost" size="sm" onClick={onPreview}>
            <IconPlayerPlayFilled />
            Watch the {formatDuration(entitlement.previewSeconds)} preview
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Stand-in caption text so the caption selector visibly does something. Real
 * playback would render WebVTT cues from the selected track.
 */
function sampleCaption(time: number, language: string): string {
  const lines = [
    "[The tide comes in over the marsh]",
    "You said you'd never come back here.",
    "I said a lot of things.",
    "[gulls calling]",
    "The council sold the whole eastern shore. Nobody voted on it.",
    "They didn't have to.",
  ];
  const index = Math.floor(time / 6) % lines.length;
  return language.startsWith("English")
    ? lines[index]
    : `[${language}] ${lines[index]}`;
}
