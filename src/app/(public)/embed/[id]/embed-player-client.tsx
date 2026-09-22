"use client";

import {
  IconMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import * as React from "react";
import { formatDuration } from "@/lib/utils";

interface EmbedPlayerProps {
  video: {
    id: string;
    title: string;
    synopsis: string | null;
    durationSeconds: number;
    thumbnailUrl: string | null;
    sampleSrc: string;
  };
  theme: "dark" | "light";
}

export function EmbedPlayerClient({ video, theme }: EmbedPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(video.durationSeconds || 0);
  const [muted, setMuted] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  const hideControlsTimer = React.useRef<NodeJS.Timeout | null>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted(videoRef.current.muted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative size-full overflow-hidden select-none ${
        theme === "light" ? "bg-white text-slate-900" : "bg-black text-white"
      }`}
    >
      <video
        ref={videoRef}
        src={video.sampleSrc}
        className="size-full object-contain cursor-pointer"
        onClick={togglePlay}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration || video.durationSeconds);
          }
        }}
        onEnded={() => setPlaying(false)}
        playsInline
      />

      {/* Center Play Button Overlay on Pause */}
      {!playing && (
        <button
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all hover:bg-black/40"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-accent/90 text-white shadow-2xl transition hover:scale-110">
            <IconPlayerPlayFilled className="ml-1 size-8" />
          </span>
        </button>
      )}

      {/* Top Header Watermark */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 truncate pr-4">
          <span className="truncate text-sm font-medium text-white/90 drop-shadow">
            {video.title}
          </span>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs font-semibold tracking-wider text-white uppercase backdrop-blur hover:bg-white/20"
        >
          MYHITCH NEXUS
        </a>
      </div>

      {/* Bottom Controls Bar */}
      <div
        className={`absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Scrubber */}
        <div className="group relative mb-2 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full accent-accent h-1.5 rounded-lg cursor-pointer bg-white/30"
          />
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-1 transition hover:text-accent"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <IconPlayerPauseFilled className="size-5" />
              ) : (
                <IconPlayerPlayFilled className="size-5" />
              )}
            </button>

            <button
              onClick={toggleMute}
              className="p-1 transition hover:text-accent"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <IconVolumeOff className="size-5" />
              ) : (
                <IconVolume className="size-5" />
              )}
            </button>

            <span className="text-xs font-mono text-white/80">
              {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="p-1 transition hover:text-accent"
              aria-label="Toggle Fullscreen"
            >
              <IconMaximize className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
