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
      <VideoDetailClient />
    </>
  );
}
