"use client";

import {
  IconAdjustments,
  IconBadgeCc,
  IconCast,
  IconMaximize,
  IconMinimize,
  IconPictureInPicture,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconVolume,
  IconVolume2,
  IconVolume3,
} from "@tabler/icons-react";
import * as React from "react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import type { AudioTrack, QualityLevel, SubtitleTrack } from "@/lib/mock-api/types";
import { clamp, cn, formatDuration } from "@/lib/utils";
import type { PlaybackControls, PlaybackState } from "./use-playback";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export interface PlayerControlsProps {
  state: PlaybackState;
  controls: PlaybackControls;
  qualities: QualityLevel[];
  subtitles: SubtitleTrack[];
  audioTracks: AudioTrack[];
  quality: string;
  onQualityChange: (id: string) => void;
  subtitle: string;
  onSubtitleChange: (id: string) => void;
  audioTrack: string;
  onAudioTrackChange: (id: string) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  pip: boolean;
  onTogglePip: () => void;
  onCast: () => void;
  /** Preview ceiling; the scrubber renders the locked remainder differently. */
  limitSeconds?: number;
  className?: string;
}

export function PlayerControls({
  state,
  controls,
  qualities,
  subtitles,
  audioTracks,
  quality,
  onQualityChange,
  subtitle,
  onSubtitleChange,
  audioTrack,
  onAudioTrackChange,
  fullscreen,
  onToggleFullscreen,
  pip,
  onTogglePip,
  onCast,
  limitSeconds,
  className,
}: PlayerControlsProps) {
  const scrubberRef = React.useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = React.useState(false);
  const [hoverTime, setHoverTime] = React.useState<number | null>(null);

  const percent = state.duration ? (state.currentTime / state.duration) * 100 : 0;
  const bufferedPercent = state.duration
    ? (state.buffered / state.duration) * 100
    : 0;
  const limitPercent =
    limitSeconds != null && state.duration
      ? (limitSeconds / state.duration) * 100
      : null;

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

  const activeSubtitle = subtitles.find((track) => track.id === subtitle);
  const activeQuality = qualities.find((level) => level.id === quality);

  return (
    <div
      className={cn(
        "bg-gradient-to-t from-black/92 via-black/65 to-transparent px-2 pb-2 pt-10 sm:px-3 sm:pb-3",
        className,
      )}
    >
      {/* Scrubber */}
      <div className="group/scrub relative px-1 pb-2">
        {hoverTime != null ? (
          <span
            className="pointer-events-none absolute -top-6 z-10 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-2xs font-medium text-white nx-tnum"
            style={{
              left: `${clamp((hoverTime / state.duration) * 100, 2, 98)}%`,
            }}
          >
            {formatDuration(hoverTime)}
          </span>
        ) : null}
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
          onPointerMove={(event) => setHoverTime(timeFromEvent(event.clientX))}
          onPointerLeave={() => setHoverTime(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") controls.skip(5);
            if (event.key === "ArrowLeft") controls.skip(-5);
            if (event.key === "Home") controls.seek(0);
            if (event.key === "End") controls.seek(state.duration);
          }}
          className="relative h-4 cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/scrub:h-1.5">
            <div
              className="absolute inset-y-0 left-0 bg-white/35"
              style={{ width: `${bufferedPercent}%` }}
            />
            {limitPercent != null ? (
              <div
                className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.22)_0_4px,transparent_4px_8px)]"
                style={{ left: `${limitPercent}%`, right: 0 }}
              />
            ) : null}
            <div
              className="absolute inset-y-0 left-0 bg-accent"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div
            className={cn(
              "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-transform",
              scrubbing ? "scale-125" : "scale-0 group-hover/scrub:scale-100",
            )}
            style={{ left: `${percent}%` }}
          />
          {limitPercent != null ? (
            <span
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-warning"
              style={{ left: `${limitPercent}%` }}
              title="Preview ends here"
            />
          ) : null}
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        <ControlButton
          label={state.playing ? "Pause" : "Play"}
          onClick={controls.toggle}
          size="lg"
        >
          {state.playing ? (
            <IconPlayerPauseFilled className="size-5" />
          ) : (
            <IconPlayerPlayFilled className="size-5" />
          )}
        </ControlButton>

        <ControlButton label="Back 10 seconds" onClick={() => controls.skip(-10)}>
          <IconPlayerSkipBackFilled className="size-4" />
        </ControlButton>
        <ControlButton label="Forward 10 seconds" onClick={() => controls.skip(10)}>
          <IconPlayerSkipForwardFilled className="size-4" />
        </ControlButton>

        {/* Volume */}
        <div className="group/vol flex items-center">
          <ControlButton
            label={state.muted ? "Unmute" : "Mute"}
            onClick={controls.toggleMute}
          >
            {state.muted || state.volume === 0 ? (
              <IconVolume3 className="size-4" />
            ) : state.volume < 0.5 ? (
              <IconVolume2 className="size-4" />
            ) : (
              <IconVolume className="size-4" />
            )}
          </ControlButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.muted ? 0 : state.volume}
            onChange={(event) => controls.setVolume(Number(event.target.value))}
            aria-label="Volume"
            className="h-1 w-0 cursor-pointer opacity-0 transition-all duration-200 group-hover/vol:mr-2 group-hover/vol:w-16 group-hover/vol:opacity-100 focus:mr-2 focus:w-16 focus:opacity-100"
          />
        </div>

        <span className="ml-1 whitespace-nowrap text-xs font-medium text-white/90 nx-tnum sm:ml-2 sm:text-sm">
          {formatDuration(state.currentTime)}
          <span className="mx-1 text-white/45">/</span>
          <span className="text-white/60">{formatDuration(state.duration)}</span>
        </span>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {/* Captions / audio */}
          <Menu
            side="top"
            align="end"
            label="Subtitles and audio"
            trigger={
              <ControlButton
                label="Subtitles and audio tracks"
                active={Boolean(activeSubtitle)}
                asDiv
              >
                <IconBadgeCc className="size-4" />
              </ControlButton>
            }
          >
            <MenuLabel>Subtitles &amp; captions</MenuLabel>
            <MenuItem active={subtitle === "off"} onClick={() => onSubtitleChange("off")}>
              Off
            </MenuItem>
            {subtitles.map((track) => (
              <MenuItem
                key={track.id}
                active={subtitle === track.id}
                onClick={() => onSubtitleChange(track.id)}
                trailing={track.autoGenerated ? "auto" : undefined}
              >
                {track.language}
                {track.kind === "sdh" ? " (SDH)" : ""}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Audio track</MenuLabel>
            {audioTracks.map((track) => (
              <MenuItem
                key={track.id}
                active={audioTrack === track.id}
                onClick={() => onAudioTrackChange(track.id)}
                trailing={
                  track.kind === "audio-description"
                    ? "AD"
                    : track.kind === "commentary"
                      ? "commentary"
                      : undefined
                }
              >
                {track.language}
              </MenuItem>
            ))}
          </Menu>

          {/* Quality + speed */}
          <Menu
            side="top"
            align="end"
            label="Playback settings"
            trigger={
              <ControlButton label="Quality and speed" asDiv>
                <IconAdjustments className="size-4" />
              </ControlButton>
            }
          >
            <MenuLabel>Quality</MenuLabel>
            <MenuItem active={quality === "auto"} onClick={() => onQualityChange("auto")}>
              Auto
              {activeQuality ? (
                <span className="ml-1 text-fg-subtle">({activeQuality.label})</span>
              ) : null}
            </MenuItem>
            {qualities.map((level) => (
              <MenuItem
                key={level.id}
                active={quality === level.id}
                onClick={() => onQualityChange(level.id)}
                trailing={`${(level.bitrateKbps / 1000).toFixed(1)} Mbps`}
              >
                {level.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Playback speed</MenuLabel>
            <div className="flex flex-wrap gap-1 p-1.5">
              {RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => controls.setRate(rate)}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors nx-tnum",
                    state.rate === rate
                      ? "bg-accent text-accent-fg"
                      : "bg-surface-3 text-fg-muted hover:text-fg",
                  )}
                >
                  {rate}×
                </button>
              ))}
            </div>
          </Menu>

          <ControlButton label="Cast to device" onClick={onCast} className="hidden sm:inline-flex">
            <IconCast className="size-4" />
          </ControlButton>

          <ControlButton
            label="Picture in picture"
            onClick={onTogglePip}
            active={pip}
            className="hidden sm:inline-flex"
          >
            <IconPictureInPicture className="size-4" />
          </ControlButton>

          <ControlButton
            label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? (
              <IconMinimize className="size-4" />
            ) : (
              <IconMaximize className="size-4" />
            )}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  active,
  size = "md",
  className,
  asDiv,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  size?: "md" | "lg";
  className?: string;
  /** Menu triggers wrap their child in a click handler, so render a div. */
  asDiv?: boolean;
}) {
  const classes = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white",
    size === "lg" ? "size-10" : "size-9",
    active && "text-accent",
    className,
  );

  if (asDiv) {
    // Menu clones this element and injects onClick (see menu.tsx) — found live
    // 2026-09-20: this branch destructured onClick but never attached it, so the
    // subtitle and quality/speed buttons looked clickable (cursor, hover state,
    // role="button") but did nothing at all. onKeyDown mirrors it for Enter/Space so a
    // role="button" div with tabIndex is actually keyboard-operable, not just visually
    // focusable.
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        className={classes}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick?.();
          }
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
