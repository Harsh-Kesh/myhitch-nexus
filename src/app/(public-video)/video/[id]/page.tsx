import type { Metadata } from "next";
import { cache } from "react";
import { channelById } from "@/lib/mock-api/data/channels";
import { videos } from "@/lib/mock-api/data/videos";
import { looksLikeRealId } from "@/lib/mock-api";
import { getVideoById } from "@/lib/server/catalogue";
import { absoluteUrl, isoDuration } from "@/lib/utils";
import { VideoDetailClient } from "./video-client";

export function generateStaticParams() {
  return videos.map((v) => ({ id: v.id }));
}

interface VideoMeta {
  title: string;
  synopsis: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  channelName: string;
  releaseDate: string | null;
  publishedAt: string | null;
}

// Shared by generateMetadata and the page body below — wrapped in React's cache() so a
// single request only resolves the video once, real or mock (see looksLikeRealId's
// comment in src/lib/mock-api/index.ts for why both branches still exist).
const resolveVideoMeta = cache(async (id: string): Promise<VideoMeta | null> => {
  if (looksLikeRealId(id)) {
    const video = await getVideoById(id);
    if (!video) return null;
    return {
      title: video.title,
      synopsis: video.synopsis,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
      channelName: video.channelName,
      releaseDate: video.releaseDate,
      publishedAt: video.publishedAt,
    };
  }
  const mock = videos.find((v) => v.id === id || v.slug === id);
  if (!mock) return null;
  return {
    title: mock.title,
    synopsis: mock.synopsis,
    thumbnailUrl: mock.thumbnailUrl ?? null,
    durationSeconds: mock.durationSeconds,
    channelName: channelById(mock.channelId)?.name ?? "MYHitch Nexus",
    releaseDate: mock.releaseDate,
    publishedAt: mock.publishedAt,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await resolveVideoMeta(id);
  if (!video) return { title: "Video not found" };

  const description =
    video.synopsis?.slice(0, 160) || `Watch ${video.title} on MYHitch Nexus.`;

  return {
    title: video.title,
    description,
    openGraph: {
      title: video.title,
      description,
      type: "video.other",
      images: video.thumbnailUrl ? [{ url: video.thumbnailUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: video.title,
      description,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
    },
  };
}

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const video = await resolveVideoMeta(id);

  const jsonLd = video
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: video.title,
        description: video.synopsis || undefined,
        thumbnailUrl: absoluteUrl(video.thumbnailUrl) ? [absoluteUrl(video.thumbnailUrl)] : undefined,
        uploadDate: video.publishedAt ?? video.releaseDate ?? undefined,
        duration: isoDuration(video.durationSeconds),
        creator: { "@type": "Organization", name: video.channelName },
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // Structured data for search engines — see FR-6.1.7 in the SRS.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      {/* This route lives under (public-video), a sibling of (public), specifically so
          no ancestor loading.tsx wraps it in an implicit Suspense boundary — see this
          repo's docs/DEVELOPMENT-PLAN.md ("Deep-dive: the video-page hang") for the
          full trail. Root cause, confirmed by inspecting React's own emitted runtime:
          any route wrapped in a loading.tsx-derived Suspense boundary ships a
          `$RC(...)` resolution script that, on the *first* such boundary reveal on a
          freshly loaded page, schedules the actual DOM swap via
          requestAnimationFrame(). Browsers never fire rAF callbacks for a
          hidden/backgrounded tab — not throttled, simply suspended — so a real user
          whose tab isn't the visible one at that exact instant (opened in a background
          tab, briefly alt-tabbed, etc.) gets stuck on the loading fallback forever, with
          no retry and no timeout. This reproduced 100% of the time in this repo's own
          headless-browser test harness, whose preview tab is always backgrounded
          (`document.hidden === true` throughout), and was confirmed mechanistically:
          manually registering a bare requestAnimationFrame() callback in that same tab
          never fired either, independent of any app code. Removing video/[id] from
          (public)'s loading.tsx-bearing segment tree (this route now has no
          loading.tsx ancestor at all, so Next never emits a deferred boundary for it)
          eliminates the hazard entirely rather than just reducing its odds. An earlier,
          independent fix (reading window.location.search instead of
          next/navigation's useSearchParams() in video-client.tsx, still in place below)
          was a real, worthwhile simplification but — as later testing showed — did not
          address this, since the boundary in question was always the implicit one from
          loading.tsx, not one created by that dynamic API. */}
      <VideoDetailClient />
    </>
  );
}
