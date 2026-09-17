// Server-only. Real "suggested thumbnail frame" extraction — the upload wizard has
// shown a mocked version of this ("Scores reflect sharpness, faces and motion — mocked
// here") since the project began, and real channels got nothing at all ("needs real
// frame extraction, which isn't built yet"). Uses the same free, open-source
// ffmpeg/ffprobe already added to nixpacks.toml for videoValidation.ts's decodability
// check — no new vendor, no new cost.
import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMasterDownloadUrl, uploadThumbnail } from "./storage";
import { probeMasterAsset } from "./videoValidation";

const execFileAsync = promisify(execFile);
const FRAME_TIMEOUT_MS = 30_000;

// Fractions of the video's duration to sample — avoids the very start/end, which are
// disproportionately likely to be black frames, fades or slates.
const SAMPLE_FRACTIONS = [0.1, 0.35, 0.6, 0.85];

export interface ThumbnailSuggestion {
  url: string;
  timestampSeconds: number;
}

async function extractFrame(signedUrl: string, timestampSeconds: number): Promise<Buffer> {
  // -ss before -i seeks in the (fast, keyframe-ish) demuxer rather than decoding from
  // the start — stays quick regardless of the video's length. Piping to stdout
  // (`pipe:1`) avoids needing a scratch file/cleanup on this process.
  const result = await execFileAsync(
    "ffmpeg",
    [
      "-v", "error",
      "-ss", timestampSeconds.toFixed(2),
      "-i", signedUrl,
      "-frames:v", "1",
      "-q:v", "3",
      "-f", "image2",
      "pipe:1",
    ],
    { timeout: FRAME_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, encoding: "buffer" },
  );
  return result.stdout;
}

/** Extracts a handful of real frames from the uploaded master and uploads each as a
 * thumbnail candidate — the wizard shows these next to the "upload your own" option,
 * same UI slot the mocked version occupied. */
export async function generateSuggestedThumbnails(
  channelId: string,
  masterAssetPath: string,
): Promise<ThumbnailSuggestion[]> {
  const probe = await probeMasterAsset(masterAssetPath);
  if (!probe.ok) {
    throw new Error(probe.reason);
  }
  const signedUrl = await createMasterDownloadUrl(masterAssetPath);

  const timestamps = SAMPLE_FRACTIONS.map((fraction) => Math.max(0, probe.durationSeconds * fraction));
  const frames = await Promise.all(
    timestamps.map(async (timestampSeconds) => {
      try {
        const buffer = await extractFrame(signedUrl, timestampSeconds);
        if (buffer.byteLength === 0) return null;
        const url = await uploadThumbnail(channelId, "suggested.jpg", buffer, "image/jpeg");
        return { url, timestampSeconds };
      } catch {
        // One bad timestamp (e.g. past a variable-frame-rate stream's last keyframe)
        // shouldn't sink the whole set — the wizard just shows fewer candidates.
        return null;
      }
    }),
  );

  return frames.filter((frame): frame is ThumbnailSuggestion => frame !== null);
}
