"use client";

import * as React from "react";
import { clamp } from "@/lib/utils";

export interface PlaybackState {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** True when no real media loaded and the timeline is being simulated. */
  simulated: boolean;
}

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
}

/**
 * Drives the player shell.
 *
 * The build ships no real media (§12), so the engine prefers the native
 * <video> element when a sample file actually loads and otherwise falls back
 * to a requestAnimationFrame-driven timeline of the correct duration. Both
 * paths expose the same state, so every control, the scrubber and the
 * preview-limit logic behave identically either way.
 */
export function usePlayback({
  videoRef,
  duration,
  startAt = 0,
  /** Hard stop for preview-limited (unentitled) playback. */
  limitSeconds,
  onLimitReached,
  onTimeUpdate,
}: {
  // HTMLAudioElement/HTMLVideoElement both extend HTMLMediaElement, and every member this
  // hook touches (.play/.pause/.currentTime/loadedmetadata/timeupdate/...) lives on that
  // shared base — AudioPlayer passes an <audio> ref through the exact same hook.
  videoRef: React.RefObject<HTMLMediaElement | null>;
  duration: number;
  startAt?: number;
  limitSeconds?: number;
  onLimitReached?: () => void;
  onTimeUpdate?: (seconds: number) => void;
}): [PlaybackState, PlaybackControls] {
  const [state, setState] = React.useState<PlaybackState>({
    playing: false,
    currentTime: startAt,
    duration,
    buffered: clamp(startAt + duration * 0.12, 0, duration),
    volume: 1,
    muted: false,
    rate: 1,
    simulated: true,
  });

  const frameRef = React.useRef<number | null>(null);
  const lastTickRef = React.useRef<number>(0);
  const limitFiredRef = React.useRef(false);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  // Detect whether a real media file is available. If metadata never arrives,
  // the simulated timeline stays in charge.
  React.useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const onLoadedMetadata = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) {
        setState((current) => ({
          ...current,
          simulated: false,
          duration: element.duration,
        }));
        element.currentTime = startAt;
      }
    };
    const onError = () => setState((current) => ({ ...current, simulated: true }));

    element.addEventListener("loadedmetadata", onLoadedMetadata);
    element.addEventListener("error", onError);
    return () => {
      element.removeEventListener("loadedmetadata", onLoadedMetadata);
      element.removeEventListener("error", onError);
    };
  }, [videoRef, startAt]);

  // Native element -> state
  React.useEffect(() => {
    const element = videoRef.current;
    if (!element || state.simulated) return;

    const onTime = () => {
      setState((current) => ({ ...current, currentTime: element.currentTime }));
    };
    const onPlay = () => setState((current) => ({ ...current, playing: true }));
    const onPause = () => setState((current) => ({ ...current, playing: false }));
    const onProgress = () => {
      const end = element.buffered.length
        ? element.buffered.end(element.buffered.length - 1)
        : 0;
      setState((current) => ({ ...current, buffered: end }));
    };

    element.addEventListener("timeupdate", onTime);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("progress", onProgress);
    return () => {
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("progress", onProgress);
    };
  }, [videoRef, state.simulated]);

  // Simulated timeline
  React.useEffect(() => {
    if (!state.simulated || !state.playing) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }

    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = ((now - lastTickRef.current) / 1000) * stateRef.current.rate;
      lastTickRef.current = now;
      setState((current) => {
        const next = current.currentTime + deltaSeconds;
        if (next >= current.duration) {
          return { ...current, currentTime: current.duration, playing: false };
        }
        return {
          ...current,
          currentTime: next,
          buffered: clamp(
            Math.max(current.buffered, next + current.duration * 0.08),
            0,
            current.duration,
          ),
        };
      });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [state.simulated, state.playing]);

  // Preview ceiling for unentitled playback.
  React.useEffect(() => {
    if (limitSeconds == null || limitFiredRef.current) return;
    if (state.currentTime >= limitSeconds) {
      limitFiredRef.current = true;
      videoRef.current?.pause();
      setState((current) => ({
        ...current,
        playing: false,
        currentTime: limitSeconds,
      }));
      onLimitReached?.();
    }
  }, [state.currentTime, limitSeconds, onLimitReached, videoRef]);

  // Progress reporting, throttled to whole seconds.
  const lastReportedRef = React.useRef(-1);
  React.useEffect(() => {
    const whole = Math.floor(state.currentTime);
    if (whole !== lastReportedRef.current && whole % 5 === 0) {
      lastReportedRef.current = whole;
      onTimeUpdate?.(state.currentTime);
    }
  }, [state.currentTime, onTimeUpdate]);

  const controls = React.useMemo<PlaybackControls>(
    () => ({
      play: () => {
        if (limitSeconds != null && stateRef.current.currentTime >= limitSeconds) return;
        videoRef.current?.play().catch(() => {
          /* No media file present — the simulated timeline takes over. */
        });
        setState((current) => ({ ...current, playing: true }));
      },
      pause: () => {
        videoRef.current?.pause();
        setState((current) => ({ ...current, playing: false }));
      },
      toggle: () => {
        if (stateRef.current.playing) {
          videoRef.current?.pause();
          setState((current) => ({ ...current, playing: false }));
        } else {
          if (limitSeconds != null && stateRef.current.currentTime >= limitSeconds) return;
          videoRef.current?.play().catch(() => {});
          setState((current) => ({ ...current, playing: true }));
        }
      },
      seek: (seconds) => {
        const ceiling = limitSeconds ?? stateRef.current.duration;
        const target = clamp(seconds, 0, ceiling);
        if (videoRef.current && !stateRef.current.simulated) {
          videoRef.current.currentTime = target;
        }
        if (limitSeconds == null || target < limitSeconds) limitFiredRef.current = false;
        setState((current) => ({ ...current, currentTime: target }));
      },
      skip: (delta) => {
        const ceiling = limitSeconds ?? stateRef.current.duration;
        const target = clamp(stateRef.current.currentTime + delta, 0, ceiling);
        if (videoRef.current && !stateRef.current.simulated) {
          videoRef.current.currentTime = target;
        }
        setState((current) => ({ ...current, currentTime: target }));
      },
      setVolume: (volume) => {
        const next = clamp(volume, 0, 1);
        if (videoRef.current) {
          videoRef.current.volume = next;
          videoRef.current.muted = next === 0;
        }
        setState((current) => ({ ...current, volume: next, muted: next === 0 }));
      },
      toggleMute: () => {
        setState((current) => {
          const muted = !current.muted;
          if (videoRef.current) videoRef.current.muted = muted;
          return { ...current, muted };
        });
      },
      setRate: (rate) => {
        if (videoRef.current) videoRef.current.playbackRate = rate;
        setState((current) => ({ ...current, rate }));
      },
    }),
    [videoRef, limitSeconds],
  );

  return [state, controls];
}
