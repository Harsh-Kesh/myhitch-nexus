// Server-only. Confirms an uploaded master is actually a decodable video file before a
// publish is allowed to reference it — part of the server-enforced publish gate (AC-3),
// same spirit as storage.ts's masterAssetExists(): a client uploading *something* to the
// signed URL isn't enough, the bytes have to hold up as real video. Free and vendor-free
// (ffprobe, from the `ffmpeg` nix package in nixpacks.toml) — distinct from, and not a
// replacement for, the content-moderation classifiers discussed in
// docs/DEVELOPMENT-PLAN.md's 2026-09-17 entry (that's about *what's in* a valid video;
// this is only about whether the file *is* one).
import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMasterDownloadUrl } from "./storage";

const execFileAsync = promisify(execFile);

// ffprobe reads the signed URL directly (native HTTP(S) input support) — generous but
// bounded, so a slow or hostile remote can't hang the publish request indefinitely.
const PROBE_TIMEOUT_MS = 30_000;

export type ProbeResult = { ok: true; durationSeconds: number } | { ok: false; reason: string };

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string }>;
}

/** Runs ffprobe against the uploaded master and confirms it's a real, readable video —
 * rejects a renamed non-video file, a corrupted upload, or an empty/truncated one.
 * Returns the real duration on success, since ffprobe already has to read it. */
export async function probeMasterAsset(path: string): Promise<ProbeResult> {
  let signedUrl: string;
  try {
    signedUrl = await createMasterDownloadUrl(path);
  } catch {
    return { ok: false, reason: "Could not access the uploaded file to verify it." };
  }

  let stdout: string;
  try {
    const result = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", signedUrl],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch {
    return { ok: false, reason: "The uploaded file isn't a valid, readable video." };
  }

  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    return { ok: false, reason: "The uploaded file isn't a valid, readable video." };
  }

  const hasVideoStream = parsed.streams?.some((stream) => stream.codec_type === "video") ?? false;
  if (!hasVideoStream) {
    return { ok: false, reason: "The uploaded file doesn't contain a video stream." };
  }

  const durationSeconds = Math.round(Number(parsed.format?.duration ?? NaN));
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, reason: "Couldn't determine the video's duration — the file may be corrupted." };
  }

  return { ok: true, durationSeconds };
}
